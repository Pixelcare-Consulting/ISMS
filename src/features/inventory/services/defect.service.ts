import { auditService } from "@/features/audit/services/audit.service";
import { aorService } from "@/features/aors/services/aor.service";
import { defectRepository } from "@/features/inventory/repositories/defect.repository";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import { hasPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/database/client";

async function assertBranchInAor(
  tenantId: string,
  userId: string,
  branchId: string,
  permissions: string[] | undefined,
) {
  const unrestricted =
    hasPermission(permissions, "branches.manage") ||
    hasPermission(permissions, "master_data.manage");
  if (unrestricted) return;

  const branchIds = await aorService.getBranchIdsForUser(tenantId, userId);
  if (!branchIds.includes(branchId)) {
    throw new Error("Branch not in your area of responsibility");
  }
}

async function resolveBranchIds(
  tenantId: string,
  userId: string,
  permissions: string[] | undefined,
) {
  const unrestricted =
    hasPermission(permissions, "branches.manage") ||
    hasPermission(permissions, "master_data.manage");
  if (unrestricted) {
    const branches = await prisma.branch.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true },
    });
    return branches.map((b) => b.id);
  }
  return aorService.getBranchIdsForUser(tenantId, userId);
}

export const defectService = {
  async reportDefect(input: {
    tenantId: string;
    actorUserId: string;
    permissions: string[] | undefined;
    branchInventoryId: string;
    reason: string;
    remarks?: string;
    photos?: Array<{
      storagePath: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
    }>;
  }) {
    const inventory = await prisma.branchInventory.findFirst({
      where: { id: input.branchInventoryId, tenantId: input.tenantId },
      include: {
        statusCode: { select: { code: true } },
        serialNumber: { select: { id: true, serialNo: true, modelId: true } },
        branch: { select: { id: true, name: true } },
      },
    });
    if (!inventory) {
      throw new Error("Inventory unit not found");
    }

    await assertBranchInAor(
      input.tenantId,
      input.actorUserId,
      inventory.branchId,
      input.permissions,
    );

    if (inventory.statusCode.code !== "STK") {
      throw new Error("Only stock (STK) units can be reported as defective");
    }

    const existing = await defectRepository.findOpenPendingByBranchInventoryId(
      input.tenantId,
      inventory.id,
    );
    if (existing) {
      throw new Error("This unit already has a pending defect inspection");
    }

    const report = await defectRepository.createReportWithPhotos({
      tenantId: input.tenantId,
      branchInventoryId: inventory.id,
      serialNumberId: inventory.serialNumberId,
      branchId: inventory.branchId,
      modelId: inventory.serialNumber.modelId,
      reason: input.reason,
      remarks: input.remarks,
      reporterUserId: input.actorUserId,
      photos: input.photos?.map((p, index) => ({
        ...p,
        sortOrder: index,
        uploadedById: input.actorUserId,
      })),
    });

    await defectRepository.writeDefectHistory({
      tenantId: input.tenantId,
      serialNumberId: inventory.serialNumberId,
      details: `Defect reported at ${inventory.branch.name}: ${input.reason}`,
      status: "pending_inspection",
      createdById: input.actorUserId,
    });

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "inventory.defect_reported",
      entityType: "BranchDefectReport",
      entityId: report.id,
      metadata: {
        branchInventoryId: inventory.id,
        branchName: inventory.branch.name,
        serialNo: inventory.serialNumber.serialNo,
        reason: input.reason,
      },
    });

    return report;
  },

  async approveDefect(input: {
    tenantId: string;
    actorUserId: string;
    permissions: string[] | undefined;
    reportId: string;
    decisionRemarks?: string;
  }) {
    const report = await defectRepository.findById(input.tenantId, input.reportId);
    if (!report) {
      throw new Error("Defect report not found");
    }
    if (report.status !== "pending_inspection") {
      throw new Error("Defect report is no longer pending inspection");
    }

    await assertBranchInAor(
      input.tenantId,
      input.actorUserId,
      report.branchId,
      input.permissions,
    );

    const defCodeId = await reasonStatusService.requireCodeId(
      input.tenantId,
      "inventory_system",
      "DEF",
    );

    const decidedAt = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.branchInventory.update({
        where: { id: report.branchInventoryId, tenantId: input.tenantId },
        data: { statusCodeId: defCodeId, updatedById: input.actorUserId },
      });
      await tx.branchDefectReport.update({
        where: { id: report.id, tenantId: input.tenantId },
        data: {
          status: "approved",
          deciderUserId: input.actorUserId,
          decidedAt,
          decisionRemarks: input.decisionRemarks,
        },
      });
    });

    await defectRepository.writeDefectHistory({
      tenantId: input.tenantId,
      serialNumberId: report.serialNumberId,
      details: `Defect approved — unit marked DEF${input.decisionRemarks ? `: ${input.decisionRemarks}` : ""}`,
      status: "DEF",
      createdById: input.actorUserId,
    });

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "inventory.defect_approved",
      entityType: "BranchDefectReport",
      entityId: report.id,
      metadata: {
        branchInventoryId: report.branchInventoryId,
        serialNo: report.serialNumber.serialNo,
      },
    });

    return defectRepository.findById(input.tenantId, report.id);
  },

  async rejectDefect(input: {
    tenantId: string;
    actorUserId: string;
    permissions: string[] | undefined;
    reportId: string;
    decisionRemarks?: string;
  }) {
    const report = await defectRepository.findById(input.tenantId, input.reportId);
    if (!report) {
      throw new Error("Defect report not found");
    }
    if (report.status !== "pending_inspection") {
      throw new Error("Defect report is no longer pending inspection");
    }

    await assertBranchInAor(
      input.tenantId,
      input.actorUserId,
      report.branchId,
      input.permissions,
    );

    const decidedAt = new Date();

    await defectRepository.closeReport({
      tenantId: input.tenantId,
      reportId: report.id,
      status: "rejected",
      deciderUserId: input.actorUserId,
      decidedAt,
      decisionRemarks: input.decisionRemarks,
    });

    await defectRepository.writeDefectHistory({
      tenantId: input.tenantId,
      serialNumberId: report.serialNumberId,
      details: `Defect report rejected — unit remains STK${input.decisionRemarks ? `: ${input.decisionRemarks}` : ""}`,
      status: "STK",
      createdById: input.actorUserId,
    });

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "inventory.defect_rejected",
      entityType: "BranchDefectReport",
      entityId: report.id,
      metadata: {
        branchInventoryId: report.branchInventoryId,
        serialNo: report.serialNumber.serialNo,
      },
    });

    return defectRepository.findById(input.tenantId, report.id);
  },

  async listPendingForUser(
    tenantId: string,
    userId: string,
    permissions: string[] | undefined,
    pagination?: { page?: number; limit?: number },
  ) {
    const branchIds = await resolveBranchIds(tenantId, userId, permissions);
    return defectRepository.listPending(tenantId, branchIds, pagination);
  },

  async getOpenPendingForInventory(tenantId: string, branchInventoryId: string) {
    return defectRepository.findOpenPendingByBranchInventoryId(
      tenantId,
      branchInventoryId,
    );
  },
};
