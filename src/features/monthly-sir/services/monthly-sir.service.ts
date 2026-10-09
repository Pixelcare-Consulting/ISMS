import type { MonthlySirRequestStatus } from "@prisma/client";

import { aorService } from "@/features/aors/services/aor.service";
import { auditService } from "@/features/audit/services/audit.service";
import { monthlySirRepository } from "@/features/monthly-sir/repositories/monthly-sir.repository";
import {
  buildMonthlySirTemplate,
  buildMonthlySirVarianceWorkbook,
  parseMonthlySirUpload,
} from "@/features/monthly-sir/services/monthly-sir.workbook";
import { stockAuditService } from "@/features/stock-audit/services/stock-audit.service";
import { prisma } from "@/lib/database/client";

async function assertBranchAccess(
  tenantId: string,
  userId: string,
  branchId: string,
  unrestricted: boolean,
) {
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, tenantId, deletedAt: null },
    select: { id: true },
  });
  if (!branch) throw new Error("Branch not found");
  if (unrestricted) return;
  const branchIds = await aorService.getBranchIdsForUser(tenantId, userId);
  if (!branchIds.includes(branchId)) {
    throw new Error("Branch is outside your area of responsibility");
  }
}

export const monthlySirService = {
  async list(
    tenantId: string,
    userId: string,
    unrestricted: boolean,
    filters: {
      branchId?: string;
      status?: MonthlySirRequestStatus;
      page?: number;
      limit?: number;
    },
  ) {
    const branchIds = unrestricted
      ? undefined
      : await aorService.getBranchIdsForUser(tenantId, userId);
    return monthlySirRepository.list(tenantId, { ...filters, branchIds });
  },

  /** Sidebar: For approval requests the reviewer can act on (AOR-scoped). */
  async countPendingForUser(
    tenantId: string,
    userId: string,
    unrestricted: boolean,
  ): Promise<number> {
    const branchIds = unrestricted
      ? undefined
      : await aorService.getBranchIdsForUser(tenantId, userId);
    return monthlySirRepository.countByStatus(tenantId, {
      branchIds,
      status: "pending",
    });
  },

  async createRequest(input: {
    tenantId: string;
    userId: string;
    branchId: string;
    purpose: string;
    unrestricted: boolean;
  }) {
    await assertBranchAccess(
      input.tenantId,
      input.userId,
      input.branchId,
      input.unrestricted,
    );
    const request = await monthlySirRepository.create({
      tenantId: input.tenantId,
      branchId: input.branchId,
      requestedById: input.userId,
      purpose: input.purpose,
    });
    await auditService.log({
      tenantId: input.tenantId,
      userId: input.userId,
      action: "monthly_sir.requested",
      entityType: "MonthlySirRequest",
      entityId: request.id,
      metadata: { branchId: input.branchId },
    });
    return request;
  },

  async review(input: {
    tenantId: string;
    userId: string;
    requestId: string;
    decision: "approve" | "reject";
    remarks?: string;
    unrestricted: boolean;
  }) {
    const request = await monthlySirRepository.findById(
      input.tenantId,
      input.requestId,
    );
    if (!request) throw new Error("Monthly SIR request not found");
    await assertBranchAccess(
      input.tenantId,
      input.userId,
      request.branchId,
      input.unrestricted,
    );

    const targetStatus = (input.decision === "approve"
      ? "approved"
      : "rejected") satisfies MonthlySirRequestStatus;
    const claim = await monthlySirRepository.claimForReview(
      input.tenantId,
      request.id,
      targetStatus,
    );
    if (claim.count !== 1) throw new Error("This request has already been reviewed");

    if (input.decision === "reject") {
      const rejected = await monthlySirRepository.finishRejection(
        input.tenantId,
        request.id,
        input.userId,
        input.remarks,
      );
      await auditService.log({
        tenantId: input.tenantId,
        userId: input.userId,
        action: "monthly_sir.rejected",
        entityType: "MonthlySirRequest",
        entityId: request.id,
        metadata: { remarks: input.remarks },
      });
      return rejected;
    }

    try {
      const countSession = await stockAuditService.createSession({
        tenantId: input.tenantId,
        userId: input.userId,
        branchId: request.branchId,
      });
      if (!countSession?.id) {
        throw new Error("Count session could not be created");
      }
      await stockAuditService.startCounting(
        input.tenantId,
        input.userId,
        countSession.id,
      );
      // Backfill expected lines if STK arrived after session create (empty open).
      await stockAuditService.ensureExpectedLinesFromStk(
        input.tenantId,
        countSession.id,
      );
      const approved = await monthlySirRepository.finishApproval(
        input.tenantId,
        request.id,
        {
          stockCountSessionId: countSession.id,
          reviewedById: input.userId,
          reviewRemarks: input.remarks,
        },
      );
      if (!approved.stockCountSessionId) {
        throw new Error("Count session was not linked to this request");
      }
      await auditService.log({
        tenantId: input.tenantId,
        userId: input.userId,
        action: "monthly_sir.approved",
        entityType: "MonthlySirRequest",
        entityId: request.id,
        metadata: { stockCountSessionId: countSession.id },
      });
      return approved;
    } catch (error) {
      await monthlySirRepository.releaseReviewClaim(input.tenantId, request.id);
      throw error;
    }
  },

  async getApprovedRequest(
    tenantId: string,
    userId: string,
    requestId: string,
    unrestricted: boolean,
  ) {
    const request = await monthlySirRepository.findById(tenantId, requestId);
    if (!request) throw new Error("Monthly SIR request not found");
    await assertBranchAccess(
      tenantId,
      userId,
      request.branchId,
      unrestricted,
    );
    if (request.status !== "approved" || !request.stockCountSessionId) {
      throw new Error("This action is available only after approval");
    }
    return request;
  },

  async buildTemplate(input: {
    tenantId: string;
    userId: string;
    requestId: string;
    unrestricted: boolean;
    generatedBy: string;
  }) {
    const request = await this.getApprovedRequest(
      input.tenantId,
      input.userId,
      input.requestId,
      input.unrestricted,
    );
    return buildMonthlySirTemplate({
      tenantId: input.tenantId,
      sessionId: request.stockCountSessionId!,
      generatedBy: input.generatedBy,
      uploadedAt: request.uploadedAt,
      uploadedBy: request.uploadedBy?.name ?? request.uploadedBy?.email,
    });
  },

  async validateScans(input: {
    tenantId: string;
    userId: string;
    requestId: string;
    unrestricted: boolean;
    serialNos: string[];
  }) {
    const request = await this.getApprovedRequest(
      input.tenantId,
      input.userId,
      input.requestId,
      input.unrestricted,
    );
    if (request.stockCountSession?.status !== "in_progress") {
      throw new Error("The linked count session is no longer accepting scans");
    }
    const serialNos = [...new Set(
      input.serialNos.map((serialNo) => serialNo.trim().toUpperCase()),
    )];
    const serials = await prisma.serialNumber.findMany({
      where: {
        tenantId: input.tenantId,
        deletedAt: null,
        OR: serialNos.map((serialNo) => ({
          serialNo: { equals: serialNo, mode: "insensitive" as const },
        })),
      },
      select: { serialNo: true },
    });
    const knownByKey = new Map(
      serials.map((serial) => [serial.serialNo.toUpperCase(), serial.serialNo]),
    );
    return {
      results: serialNos.map((serialNo) => ({
        serialNo: knownByKey.get(serialNo) ?? serialNo,
        valid: knownByKey.has(serialNo),
      })),
    };
  },

  async buildTemplateFromScans(input: {
    tenantId: string;
    userId: string;
    requestId: string;
    unrestricted: boolean;
    generatedBy: string;
    serialNos: string[];
  }) {
    const request = await this.getApprovedRequest(
      input.tenantId,
      input.userId,
      input.requestId,
      input.unrestricted,
    );
    if (request.stockCountSession?.status !== "in_progress") {
      throw new Error("The linked count session is no longer accepting scans");
    }
    return buildMonthlySirTemplate({
      tenantId: input.tenantId,
      sessionId: request.stockCountSessionId!,
      generatedBy: input.generatedBy,
      scannedSerialNos: input.serialNos,
    });
  },

  async previewUpload(input: {
    tenantId: string;
    userId: string;
    requestId: string;
    unrestricted: boolean;
    file: Buffer;
  }) {
    const request = await this.getApprovedRequest(
      input.tenantId,
      input.userId,
      input.requestId,
      input.unrestricted,
    );
    if (request.stockCountSession?.status !== "in_progress") {
      throw new Error("The linked count session is no longer accepting uploads");
    }
    const rows = await parseMonthlySirUpload(input.file);
    const [serials, statuses] = await Promise.all([
      prisma.serialNumber.findMany({
        where: {
          tenantId: input.tenantId,
          OR: rows.map((row) => ({
            serialNo: { equals: row.serialNo, mode: "insensitive" as const },
          })),
        },
        select: { serialNo: true },
      }),
      prisma.reasonStatusCode.findMany({
        where: {
          tenantId: input.tenantId,
          recordStatus: "active",
          reasonStatus: { code: "inventory_system" },
        },
        select: { code: true },
      }),
    ]);
    const knownSerials = new Set(serials.map((row) => row.serialNo.toUpperCase()));
    const knownStatuses = new Set(statuses.map((row) => row.code.toUpperCase()));
    const invalidSerials = rows
      .filter((row) => !knownSerials.has(row.serialNo.toUpperCase()))
      .map((row) => row.serialNo);
    const invalidStatuses = rows
      .filter((row) => !knownStatuses.has(row.pcount))
      .map((row) => `${row.pcount} (row ${row.rowNumber})`);
    const counts = Object.entries(
      rows.reduce<Record<string, number>>((summary, row) => {
        summary[row.pcount] = (summary[row.pcount] ?? 0) + 1;
        return summary;
      }, {}),
    )
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => a.status.localeCompare(b.status));
    return { rowCount: rows.length, counts, invalidSerials, invalidStatuses };
  },

  async applyUpload(input: {
    tenantId: string;
    userId: string;
    requestId: string;
    unrestricted: boolean;
    file: Buffer;
  }) {
    const request = await this.getApprovedRequest(
      input.tenantId,
      input.userId,
      input.requestId,
      input.unrestricted,
    );
    const sessionId = request.stockCountSessionId!;
    if (request.stockCountSession?.status !== "in_progress") {
      throw new Error("The linked count session is no longer accepting uploads");
    }
    const preview = await this.previewUpload(input);
    if (preview.invalidSerials.length > 0) {
      throw new Error(`Unknown serials: ${preview.invalidSerials.join(", ")}`);
    }
    if (preview.invalidStatuses.length > 0) {
      throw new Error(`Invalid P-COUNT statuses: ${preview.invalidStatuses.join(", ")}`);
    }

    const rows = await parseMonthlySirUpload(input.file);
    const session = await prisma.stockCountSession.findFirst({
      where: { id: sessionId, tenantId: input.tenantId },
      include: {
        lines: {
          include: {
            serialNumber: { select: { serialNo: true } },
            branchInventory: {
              select: { statusCode: { select: { code: true } } },
            },
          },
        },
      },
    });
    if (!session) throw new Error("Linked count session not found");
    const lineBySerial = new Map(
      session.lines.map((line) => [line.serialNumber.serialNo.toUpperCase(), line]),
    );

    let matched = 0;
    let surplus = 0;
    let statusMismatch = 0;
    for (const row of rows) {
      const key = row.serialNo.toUpperCase();
      const existing = lineBySerial.get(key);
      let lineId: string;
      if (existing) {
        if (existing.status === "pending") {
          await stockAuditService.recordCount(
            input.tenantId,
            input.userId,
            sessionId,
            existing.id,
          );
        } else if (existing.status !== "counted") {
          throw new Error(`Serial ${row.serialNo} cannot be counted in its current state`);
        }
        lineId = existing.id;
        matched += 1;
      } else {
        const scanned = await stockAuditService.scanSerial(
          input.tenantId,
          input.userId,
          sessionId,
          row.serialNo,
        );
        lineId = scanned.lineId;
        surplus += 1;
      }

      await prisma.stockCountLine.update({
        where: { id: lineId },
        data: { notes: `P-COUNT: ${row.pcount}` },
      });
      const systemCode = existing?.branchInventory?.statusCode.code.toUpperCase();
      if (existing?.expectedInCount && systemCode && systemCode !== row.pcount) {
        await prisma.$transaction([
          prisma.stockCountLine.update({
            where: { id: lineId },
            data: { status: "variance" },
          }),
          prisma.stockVariance.create({
            data: {
              tenantId: input.tenantId,
              sessionId,
              lineId,
              varianceType: "status_mismatch",
              status: "open",
              description: `System ${systemCode}; P-COUNT ${row.pcount}`,
            },
          }),
        ]);
        statusMismatch += 1;
      }
    }

    await monthlySirRepository.markUploaded(
      input.tenantId,
      request.id,
      input.userId,
    );
    await stockAuditService.completeCounting(
      input.tenantId,
      input.userId,
      sessionId,
    );
    await auditService.log({
      tenantId: input.tenantId,
      userId: input.userId,
      action: "monthly_sir.uploaded",
      entityType: "MonthlySirRequest",
      entityId: request.id,
      metadata: { rowCount: rows.length, matched, surplus, statusMismatch },
    });
    return { rowCount: rows.length, matched, surplus, statusMismatch };
  },

  async buildVariance(input: {
    tenantId: string;
    userId: string;
    requestId: string;
    unrestricted: boolean;
    generatedBy: string;
  }) {
    const request = await this.getApprovedRequest(
      input.tenantId,
      input.userId,
      input.requestId,
      input.unrestricted,
    );
    return buildMonthlySirVarianceWorkbook({
      tenantId: input.tenantId,
      sessionId: request.stockCountSessionId!,
      generatedBy: input.generatedBy,
    });
  },
};
