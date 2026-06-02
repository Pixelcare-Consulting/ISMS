import { auditService } from "@/features/audit/services/audit.service";
import { aorService } from "@/features/aors/services/aor.service";
import { reasonStatusRepository } from "@/features/reason-status/repositories/reason-status.repository";
import { sapService } from "@/features/sap/services/sap.service";
import { stockAuditRepository } from "@/features/stock-audit/repositories/stock-audit.repository";
import { VARIANCE_TYPES } from "@/features/stock-audit/constants/stock-count-workflow";
import { prisma } from "@/lib/database/client";

function nextSessionNo() {
  return `CNT-${Date.now().toString(36).toUpperCase()}`;
}

export const stockAuditService = {
  async listForUser(
    tenantId: string,
    userId: string,
    isUnrestricted: boolean,
    pagination?: { page?: number },
  ) {
    const branchIds = isUnrestricted
      ? undefined
      : await aorService.getBranchIdsForUser(tenantId, userId);

    if (!isUnrestricted && (!branchIds || branchIds.length === 0)) {
      return stockAuditRepository.listSessions(tenantId, [], pagination);
    }

    return stockAuditRepository.listSessions(tenantId, branchIds, pagination);
  },

  async getSession(tenantId: string, sessionId: string) {
    return stockAuditRepository.findSessionById(tenantId, sessionId);
  },

  /** Generate count list from branch STK inventory (CSV step 37). */
  async createSession(input: {
    tenantId: string;
    userId: string;
    branchId: string;
  }) {
    const stkCode = await reasonStatusRepository.findCodeId(
      input.tenantId,
      "inventory_system",
      "STK",
    );
    if (!stkCode) {
      throw new Error("STK inventory status code is not configured");
    }

    const inventory = await prisma.branchInventory.findMany({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        statusCodeId: stkCode.id,
      },
      select: {
        id: true,
        serialNumberId: true,
        statusCodeId: true,
        serialNumber: { select: { modelId: true } },
      },
    });

    const session = await stockAuditRepository.createSession({
      tenantId: input.tenantId,
      branchId: input.branchId,
      sessionNo: nextSessionNo(),
      createdById: input.userId,
    });

    if (inventory.length > 0) {
      await stockAuditRepository.createLines(
        inventory.map((item) => ({
          sessionId: session.id,
          branchInventoryId: item.id,
          serialNumberId: item.serialNumberId,
          modelId: item.serialNumber.modelId,
          systemStatusCodeId: item.statusCodeId,
          expectedInCount: true,
          status: "pending",
        })),
      );
    }

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.userId,
      action: "stock_count.session_created",
      entityType: "StockCountSession",
      entityId: session.id,
      metadata: {
        sessionNo: session.sessionNo,
        branchId: input.branchId,
        lineCount: inventory.length,
      },
    });

    return stockAuditRepository.findSessionById(input.tenantId, session.id);
  },

  async startCounting(tenantId: string, userId: string, sessionId: string) {
    const session = await stockAuditRepository.findSessionById(tenantId, sessionId);
    if (!session) throw new Error("Count session not found");
    if (session.status !== "draft") {
      throw new Error("Only draft sessions can be started");
    }

    await stockAuditRepository.updateSessionStatus(tenantId, sessionId, "in_progress");

    await auditService.log({
      tenantId,
      userId,
      action: "stock_count.started",
      entityType: "StockCountSession",
      entityId: sessionId,
      metadata: { sessionNo: session.sessionNo },
    });
  },

  /** PS scan/record (CSV step 38). */
  async recordCount(tenantId: string, userId: string, sessionId: string, lineId: string) {
    const session = await stockAuditRepository.findSessionById(tenantId, sessionId);
    if (!session) throw new Error("Count session not found");
    if (session.status !== "in_progress") {
      throw new Error("Session is not in counting mode");
    }

    const line = await stockAuditRepository.findLine(sessionId, lineId);
    if (!line) throw new Error("Count line not found");
    if (line.status !== "pending") {
      throw new Error("Line already counted");
    }

    await stockAuditRepository.markLineCounted(lineId, userId);

    await auditService.log({
      tenantId,
      userId,
      action: "stock_count.line_recorded",
      entityType: "StockCountLine",
      entityId: lineId,
      metadata: { sessionId, sessionNo: session.sessionNo },
    });
  },

  /** Complete counting and generate variance report (CSV step 39). */
  async completeCounting(tenantId: string, userId: string, sessionId: string) {
    const session = await stockAuditRepository.findSessionById(tenantId, sessionId);
    if (!session) throw new Error("Count session not found");
    if (session.status !== "in_progress") {
      throw new Error("Session is not in counting mode");
    }

    const pendingLines = session.lines.filter((l) => l.status === "pending");
    const nextStatus =
      pendingLines.length > 0 ? "variances_under_investigation" : "counting_complete";

    await stockAuditRepository.completeCountingTx(
      tenantId,
      sessionId,
      pendingLines.map((l) => l.id),
      {
        tenantId,
        sessionId,
        varianceType: VARIANCE_TYPES.missing,
        status: "open",
        description: "Expected unit not scanned during physical count",
      },
      nextStatus,
    );

    await auditService.log({
      tenantId,
      userId,
      action: "stock_count.completed",
      entityType: "StockCountSession",
      entityId: sessionId,
      metadata: {
        sessionNo: session.sessionNo,
        varianceCount: pendingLines.length,
      },
    });
  },

  /** TL investigation (CSV step 40). */
  async investigateVariance(
    tenantId: string,
    userId: string,
    varianceId: string,
    notes: string,
  ) {
    const variance = await stockAuditRepository.findVariance(tenantId, varianceId);
    if (!variance) throw new Error("Variance not found");
    if (!["open", "investigating"].includes(variance.status)) {
      throw new Error("Variance cannot be investigated in current status");
    }

    await stockAuditRepository.updateVariance(tenantId, varianceId, {
      status: "investigating",
      investigatedById: userId,
      investigatedAt: new Date(),
      investigationNotes: notes,
    });

    await stockAuditRepository.updateSessionStatus(
      tenantId,
      variance.sessionId,
      "variances_under_investigation",
    );

    await auditService.log({
      tenantId,
      userId,
      action: "stock_count.variance_investigated",
      entityType: "StockVariance",
      entityId: varianceId,
      metadata: { sessionId: variance.sessionId, notes },
    });
  },

  /** Admin adjustment request (CSV step 41 — SAP handoff stub). */
  async requestAdjustment(tenantId: string, userId: string, varianceId: string) {
    const variance = await stockAuditRepository.findVariance(tenantId, varianceId);
    if (!variance) throw new Error("Variance not found");
    if (variance.status !== "investigating") {
      throw new Error("Variance must be under investigation before adjustment request");
    }

    await stockAuditRepository.updateVariance(tenantId, varianceId, {
      status: "approved_adjustment",
      adjustmentRequestedById: userId,
      adjustmentRequestedAt: new Date(),
    });

    await stockAuditRepository.updateSessionStatus(
      tenantId,
      variance.sessionId,
      "pending_adjustment",
    );

    const job = await sapService.emitInventoryAdjustment(tenantId, {
      varianceId,
      sessionId: variance.sessionId,
      varianceType: variance.varianceType,
      description: variance.description,
    });

    await stockAuditRepository.updateVariance(tenantId, varianceId, {
      status: "sap_handoff",
    });

    await stockAuditRepository.updateSessionStatus(
      tenantId,
      variance.sessionId,
      "adjustment_requested",
    );

    await auditService.log({
      tenantId,
      userId,
      action: "stock_count.adjustment_requested",
      entityType: "StockVariance",
      entityId: varianceId,
      metadata: {
        sessionId: variance.sessionId,
        sapJobId: job.id,
      },
    });

    await sapService.processPendingJobs(tenantId, userId);
  },

  async closeSession(tenantId: string, userId: string, sessionId: string) {
    const session = await stockAuditRepository.findSessionById(tenantId, sessionId);
    if (!session) throw new Error("Count session not found");

    const openVariances = session.variances.filter(
      (v) => !["closed", "rejected"].includes(v.status),
    );
    if (openVariances.length > 0) {
      throw new Error("All variances must be resolved before closing");
    }

    await stockAuditRepository.updateSessionStatus(tenantId, sessionId, "closed", {
      closedAt: new Date(),
    });

    await auditService.log({
      tenantId,
      userId,
      action: "stock_count.session_closed",
      entityType: "StockCountSession",
      entityId: sessionId,
      metadata: { sessionNo: session.sessionNo },
    });
  },
};
