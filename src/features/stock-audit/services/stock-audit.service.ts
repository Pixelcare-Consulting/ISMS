import type { StockCountSessionStatus } from "@prisma/client";

import { auditService } from "@/features/audit/services/audit.service";
import { aorService } from "@/features/aors/services/aor.service";
import { reasonStatusRepository } from "@/features/reason-status/repositories/reason-status.repository";
import { sapService } from "@/features/sap/services/sap.service";
import { stockAuditRepository } from "@/features/stock-audit/repositories/stock-audit.repository";
import type {
  StockCountListSort,
  StockCountListSortDir,
} from "@/features/stock-audit/repositories/stock-audit.repository";
import {
  POSTABLE_VARIANCE_STATUSES,
  STOCK_COUNT_SESSION_LABELS,
  VARIANCE_TYPES,
} from "@/features/stock-audit/constants/stock-count-workflow";
import { prisma } from "@/lib/database/client";

function nextSessionNo() {
  return `CNT-${Date.now().toString(36).toUpperCase()}`;
}

export interface StockCountStatusKpi {
  code: string;
  name: string;
  count: number;
}

export interface StockCountKpis {
  totalSessions: number;
  statuses: StockCountStatusKpi[];
}

const SESSION_STATUS_ORDER = Object.keys(
  STOCK_COUNT_SESSION_LABELS,
) as StockCountSessionStatus[];

const REVIEW_STATUSES: StockCountSessionStatus[] = [
  "counting_complete",
  "variances_under_investigation",
  "pending_adjustment",
];

export const stockAuditService = {
  async listForUser(
    tenantId: string,
    userId: string,
    isUnrestricted: boolean,
    pagination?: { page?: number; limit?: number },
    sort?: { field?: StockCountListSort; dir?: StockCountListSortDir },
  ) {
    const branchIds = isUnrestricted
      ? undefined
      : await aorService.getBranchIdsForUser(tenantId, userId);

    if (!isUnrestricted && (!branchIds || branchIds.length === 0)) {
      return stockAuditRepository.listSessions(tenantId, [], pagination, sort);
    }

    return stockAuditRepository.listSessions(tenantId, branchIds, pagination, sort);
  },

  async getKpis(
    tenantId: string,
    userId: string,
    isUnrestricted: boolean,
  ): Promise<StockCountKpis> {
    const emptyStatuses = SESSION_STATUS_ORDER.map((status) => ({
      code: status,
      name: STOCK_COUNT_SESSION_LABELS[status],
      count: 0,
    }));

    const branchIds = isUnrestricted
      ? undefined
      : await aorService.getBranchIdsForUser(tenantId, userId);

    if (!isUnrestricted && (!branchIds || branchIds.length === 0)) {
      return { totalSessions: 0, statuses: emptyStatuses };
    }

    const [statusGroups, totalSessions] = await Promise.all([
      stockAuditRepository.countByStatus(tenantId, branchIds),
      stockAuditRepository.countAll(tenantId, branchIds),
    ]);

    const countByStatus = new Map(
      statusGroups.map((g) => [g.status, g._count.id]),
    );

    return {
      totalSessions,
      statuses: SESSION_STATUS_ORDER.map((status) => ({
        code: status,
        name: STOCK_COUNT_SESSION_LABELS[status],
        count: countByStatus.get(status) ?? 0,
      })),
    };
  },

  async getSession(tenantId: string, sessionId: string) {
    return stockAuditRepository.findSessionById(tenantId, sessionId);
  },

  /** Generate count list from branch STK inventory (B1 Inventory Counting — Open). */
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

  /** Mark an expected line as counted (button or after SN match). */
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

  /**
   * Scan a serial number: match expected line, or add unexpected serial as surplus candidate.
   */
  async scanSerial(
    tenantId: string,
    userId: string,
    sessionId: string,
    serialNoRaw: string,
  ): Promise<{ kind: "counted" | "surplus"; lineId: string; serialNo: string }> {
    const serialNo = serialNoRaw.trim();
    if (!serialNo) throw new Error("Serial number is required");

    const session = await stockAuditRepository.findSessionById(tenantId, sessionId);
    if (!session) throw new Error("Count session not found");
    if (session.status !== "in_progress") {
      throw new Error("Session is not in counting mode");
    }

    const serial = await prisma.serialNumber.findFirst({
      where: { tenantId, serialNo: { equals: serialNo, mode: "insensitive" } },
      select: { id: true, serialNo: true, modelId: true },
    });
    if (!serial) {
      throw new Error(`Serial ${serialNo} is not registered in the catalog`);
    }

    const existingLine = await stockAuditRepository.findLineBySerial(sessionId, serial.id);
    if (existingLine) {
      if (existingLine.status === "pending") {
        await stockAuditRepository.markLineCounted(existingLine.id, userId);
        await auditService.log({
          tenantId,
          userId,
          action: "stock_count.line_scanned",
          entityType: "StockCountLine",
          entityId: existingLine.id,
          metadata: { sessionId, sessionNo: session.sessionNo, serialNo: serial.serialNo },
        });
        return { kind: "counted", lineId: existingLine.id, serialNo: serial.serialNo };
      }
      throw new Error(`Serial ${serial.serialNo} is already recorded on this count`);
    }

    const stkCode = await reasonStatusRepository.findCodeId(tenantId, "inventory_system", "STK");
    if (!stkCode) throw new Error("STK inventory status code is not configured");

    const branchInv = await prisma.branchInventory.findFirst({
      where: {
        tenantId,
        branchId: session.branchId,
        serialNumberId: serial.id,
      },
      select: { id: true, statusCodeId: true },
    });

    const line = await stockAuditRepository.createLine({
      sessionId,
      branchInventoryId: branchInv?.id ?? null,
      serialNumberId: serial.id,
      modelId: serial.modelId,
      systemStatusCodeId: branchInv?.statusCodeId ?? stkCode.id,
      expectedInCount: false,
      status: "counted",
      countedAt: new Date(),
      countedById: userId,
      notes: "Unexpected serial scanned during count",
    });

    await auditService.log({
      tenantId,
      userId,
      action: "stock_count.surplus_scanned",
      entityType: "StockCountLine",
      entityId: line.id,
      metadata: { sessionId, sessionNo: session.sessionNo, serialNo: serial.serialNo },
    });

    return { kind: "surplus", lineId: line.id, serialNo: serial.serialNo };
  },

  /** Clear Counted flag and reopen for recount (before posting). */
  async recountLine(tenantId: string, userId: string, sessionId: string, lineId: string) {
    const session = await stockAuditRepository.findSessionById(tenantId, sessionId);
    if (!session) throw new Error("Count session not found");

    const allowed: StockCountSessionStatus[] = [
      "in_progress",
      ...REVIEW_STATUSES,
    ];
    if (!allowed.includes(session.status)) {
      throw new Error("Line cannot be recounted in the current session status");
    }

    const line = await stockAuditRepository.findLine(sessionId, lineId);
    if (!line) throw new Error("Count line not found");

    if (line.variance) {
      if (!["open", "investigating", "rejected"].includes(line.variance.status)) {
        throw new Error("Posted or SAP-handed variances cannot be recounted here");
      }
      await stockAuditRepository.deleteVariance(tenantId, line.variance.id);
    }

    if (line.expectedInCount) {
      await stockAuditRepository.clearLineCounted(lineId);
    } else {
      // Unexpected surplus line — remove from session so it can be re-scanned
      await prisma.stockCountLine.delete({ where: { id: lineId } });
    }

    if (session.status !== "in_progress") {
      await stockAuditRepository.updateSessionStatus(tenantId, sessionId, "in_progress");
    }

    await auditService.log({
      tenantId,
      userId,
      action: "stock_count.line_recount",
      entityType: "StockCountLine",
      entityId: lineId,
      metadata: { sessionId, sessionNo: session.sessionNo },
    });
  },

  /** Complete counting and generate missing + surplus variances. */
  async completeCounting(tenantId: string, userId: string, sessionId: string) {
    const session = await stockAuditRepository.findSessionById(tenantId, sessionId);
    if (!session) throw new Error("Count session not found");
    if (session.status !== "in_progress") {
      throw new Error("Session is not in counting mode");
    }

    const missingLines = session.lines.filter(
      (l) => l.status === "pending" && l.expectedInCount,
    );
    const surplusLines = session.lines.filter(
      (l) => l.status === "counted" && !l.expectedInCount,
    );
    const varianceCount = missingLines.length + surplusLines.length;
    const nextStatus: StockCountSessionStatus =
      varianceCount > 0 ? "variances_under_investigation" : "counting_complete";

    await stockAuditRepository.completeCountingTx(
      tenantId,
      sessionId,
      missingLines.map((l) => l.id),
      surplusLines.map((l) => l.id),
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
        missingCount: missingLines.length,
        surplusCount: surplusLines.length,
      },
    });
  },

  /** TL investigation notes. */
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

  /** Reject a variance without SAP / stock effect. */
  async rejectVariance(
    tenantId: string,
    userId: string,
    varianceId: string,
    notes?: string,
  ) {
    const variance = await stockAuditRepository.findVariance(tenantId, varianceId);
    if (!variance) throw new Error("Variance not found");
    if (!["open", "investigating"].includes(variance.status)) {
      throw new Error("Only open or investigating variances can be rejected");
    }

    await stockAuditRepository.updateVariance(tenantId, varianceId, {
      status: "rejected",
      investigatedById: userId,
      investigatedAt: new Date(),
      investigationNotes: notes?.trim()
        ? notes.trim()
        : variance.investigationNotes ?? "Rejected without posting",
    });

    if (variance.lineId) {
      await prisma.stockCountLine.update({
        where: { id: variance.lineId },
        data: { status: "resolved" },
      });
    }

    await auditService.log({
      tenantId,
      userId,
      action: "stock_count.variance_rejected",
      entityType: "StockVariance",
      entityId: varianceId,
      metadata: { sessionId: variance.sessionId },
    });
  },

  /**
   * Session-level Post differences (B1 Inventory Posting):
   * apply local STK corrections, then emit SL InventoryPostings or an honest pending queue.
   */
  async postDifferences(tenantId: string, userId: string, sessionId: string) {
    const session = await stockAuditRepository.findSessionById(tenantId, sessionId);
    if (!session) throw new Error("Count session not found");

    if (
      ![
        "counting_complete",
        "variances_under_investigation",
        "pending_adjustment",
      ].includes(session.status)
    ) {
      throw new Error("Session is not ready to post differences");
    }

    const variances = await stockAuditRepository.findVariancesForPosting(
      tenantId,
      sessionId,
      POSTABLE_VARIANCE_STATUSES,
    );

    if (variances.length === 0) {
      // No differences left — mark ready to close
      await stockAuditRepository.updateSessionStatus(
        tenantId,
        sessionId,
        "counting_complete",
      );
      return {
        postedCount: 0,
        sapMode: "none" as const,
        sapDocRef: null as string | null,
        message: "No open differences to post",
      };
    }

    const stkCode = await reasonStatusRepository.findCodeId(
      tenantId,
      "inventory_system",
      "STK",
    );
    if (!stkCode) throw new Error("STK inventory status code is not configured");

    await stockAuditRepository.updateSessionStatus(tenantId, sessionId, "posting");

    // Local STK corrections first (portal stock effect)
    await prisma.$transaction(async (tx) => {
      for (const variance of variances) {
        const line = variance.line;
        if (!line) continue;

        if (variance.varianceType === VARIANCE_TYPES.missing) {
          await tx.branchInventory.deleteMany({
            where: {
              tenantId,
              branchId: session.branchId,
              serialNumberId: line.serialNumberId,
              statusCodeId: stkCode.id,
            },
          });
        } else if (variance.varianceType === VARIANCE_TYPES.surplus) {
          const existing = await tx.branchInventory.findFirst({
            where: {
              tenantId,
              branchId: session.branchId,
              serialNumberId: line.serialNumberId,
            },
          });
          if (existing) {
            if (existing.statusCodeId !== stkCode.id) {
              await tx.branchInventory.update({
                where: { id: existing.id },
                data: { statusCodeId: stkCode.id, updatedById: userId },
              });
            }
          } else {
            await tx.branchInventory.create({
              data: {
                tenantId,
                branchId: session.branchId,
                serialNumberId: line.serialNumberId,
                statusCodeId: stkCode.id,
                updatedById: userId,
              },
            });
          }
        }

        await tx.stockCountLine.update({
          where: { id: line.id },
          data: { status: "resolved" },
        });
      }
    });

    const postingLines = variances.map((v) => ({
      varianceId: v.id,
      varianceType: v.varianceType,
      serialNo: v.line?.serialNumber.serialNo ?? "",
      itemCode: v.line?.model.skuCode ?? "",
      serialNumberId: v.line?.serialNumberId ?? "",
      countedQuantity: v.varianceType === VARIANCE_TYPES.surplus ? 1 : 0,
      inWarehouseQuantity: v.varianceType === VARIANCE_TYPES.missing ? 1 : 0,
    }));

    const result = await sapService.emitInventoryPosting(tenantId, {
      sessionId,
      sessionNo: session.sessionNo,
      branchId: session.branchId,
      warehouseCode: session.branch.sapCode,
      lines: postingLines,
    });

    const varianceIds = variances.map((v) => v.id);

    if (result.mode === "posted" && result.sapDocRef) {
      await prisma.stockVariance.updateMany({
        where: { id: { in: varianceIds }, tenantId },
        data: {
          status: "closed",
          sapDocRef: result.sapDocRef,
          adjustmentRequestedAt: new Date(),
          adjustmentRequestedById: userId,
        },
      });
      await stockAuditRepository.updateSessionStatus(
        tenantId,
        sessionId,
        "counting_complete",
      );
    } else {
      // Honest pending — local stock corrected; SAP doc not fabricated
      await prisma.stockVariance.updateMany({
        where: { id: { in: varianceIds }, tenantId },
        data: {
          status: "sap_handoff",
          sapDocRef: null,
          adjustmentRequestedAt: new Date(),
          adjustmentRequestedById: userId,
        },
      });
      await stockAuditRepository.updateSessionStatus(
        tenantId,
        sessionId,
        "adjustment_requested",
      );
    }

    await auditService.log({
      tenantId,
      userId,
      action: "stock_count.differences_posted",
      entityType: "StockCountSession",
      entityId: sessionId,
      metadata: {
        sessionNo: session.sessionNo,
        postedCount: variances.length,
        sapMode: result.mode,
        sapDocRef: result.sapDocRef,
        sapJobId: result.jobId,
      },
    });

    return {
      postedCount: variances.length,
      sapMode: result.mode,
      sapDocRef: result.sapDocRef,
      message: result.message,
    };
  },

  async closeSession(tenantId: string, userId: string, sessionId: string) {
    const session = await stockAuditRepository.findSessionById(tenantId, sessionId);
    if (!session) throw new Error("Count session not found");
    if (session.status === "closed") {
      throw new Error("Session is already closed");
    }

    const openVariances = session.variances.filter(
      (v) => !["closed", "rejected"].includes(v.status),
    );
    if (openVariances.length > 0) {
      throw new Error(
        "All variances must be closed or rejected before closing (pending SAP handoffs must finish first)",
      );
    }

    const closedAt = new Date();
    const { historyCount } = await stockAuditRepository.closeSessionWithPcountHistory(
      tenantId,
      sessionId,
      userId,
      session.sessionNo,
      closedAt,
    );

    await auditService.log({
      tenantId,
      userId,
      action: "stock_count.session_closed",
      entityType: "StockCountSession",
      entityId: sessionId,
      metadata: {
        sessionNo: session.sessionNo,
        pcountHistoryCount: historyCount,
      },
    });
  },

  /** Closed sessions summary for /reports/pcount. */
  async listClosedForReport(
    tenantId: string,
    userId: string,
    isUnrestricted: boolean,
    filters?: {
      branchId?: string;
      from?: Date;
      to?: Date;
      page?: number;
      sort?: string;
      sortDir?: "asc" | "desc";
    },
  ) {
    const branchIds = isUnrestricted
      ? undefined
      : await aorService.getBranchIdsForUser(tenantId, userId);
    const sort = { field: filters?.sort, dir: filters?.sortDir };

    if (!isUnrestricted && (!branchIds || branchIds.length === 0)) {
      return stockAuditRepository.listClosedSessions(
        tenantId,
        { branchIds: [] },
        { page: filters?.page },
        sort,
      );
    }

    return stockAuditRepository.listClosedSessions(
      tenantId,
      {
        branchIds,
        branchId: filters?.branchId,
        from: filters?.from,
        to: filters?.to,
      },
      { page: filters?.page },
      sort,
    );
  },
};
