import { auditService } from "@/features/audit/services/audit.service";
import { aorRepository } from "@/features/aors/repositories/aor.repository";
import {
  inventoryApprovalLedger,
  type InventoryApprovalDocument,
} from "@/features/inventory-approvals/services/inventory-approval-ledger";
import { lockSerialNumbers } from "@/features/inventory/services/serial-placement";
import { aorService } from "@/features/aors/services/aor.service";
import {
  assertDefectApprover,
  defectApprovalBranchIds,
} from "@/features/inventory/lib/defect-approver";
import { defectRepository } from "@/features/inventory/repositories/defect.repository";
import { TEAM_LEADER_ROLE_SLUG } from "@/features/orders/constants/order-workflow";
import { notificationService } from "@/features/notifications/services/notification.service";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import { hasPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/shared/logger";

function approvalDocument(tenantId: string, reportId: string): InventoryApprovalDocument {
  return {
    tenantId,
    sourceType: "DEFECT_REPORT",
    sourceId: reportId,
    sourceNo: null,
    step: "TL_APPROVAL",
  };
}

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

async function notifyBranchTeamLeaders(input: {
  tenantId: string;
  actorUserId: string;
  branchId: string;
  branchName: string;
  serialNumberId: string;
  serialNo: string;
  reason: string;
}) {
  try {
    const approverIds = await aorRepository.listUserIdsForBranchByRole(
      input.tenantId,
      input.branchId,
      TEAM_LEADER_ROLE_SLUG,
    );
    const recipients = approverIds.filter((userId) => userId !== input.actorUserId);
    if (recipients.length === 0) return;

    await Promise.all(
      recipients.map((userId) =>
        notificationService.createNotification({
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          data: {
            audience: "USER",
            userId,
            type: "defect_report",
            title: `${input.serialNo} · ${input.branchName}`,
            body: `A defect needs your approval: ${input.reason}`,
            href: `/inventory/serial-numbers/${input.serialNumberId}`,
            metadata: {
              serialNumberId: input.serialNumberId,
              branchId: input.branchId,
            },
          },
        }),
      ),
    );
  } catch (error) {
    logger.warn(
      {
        tenantId: input.tenantId,
        serialNumberId: input.serialNumberId,
        err: error,
      },
      "defect approval notification failed",
    );
  }
}

const REPORTABLE_DEFECT_STATUSES = new Set(["STK", "DU"]);

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

    if (!REPORTABLE_DEFECT_STATUSES.has(inventory.statusCode.code)) {
      throw new Error("Only stock or display units can be reported as defective");
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

    await inventoryApprovalLedger.recordRequested(prisma, approvalDocument(input.tenantId, report.id), {
      requestedById: input.actorUserId,
      units: [
        {
          serialNumberId: inventory.serialNumberId,
          remarks: input.remarks,
          problemDescription: input.reason,
        },
      ],
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

    await notifyBranchTeamLeaders({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      branchId: inventory.branchId,
      branchName: inventory.branch.name,
      serialNumberId: inventory.serialNumberId,
      serialNo: inventory.serialNumber.serialNo,
      reason: input.reason,
    });

    return report;
  },

  async approveDefect(input: {
    tenantId: string;
    actorUserId: string;
    roleSlugs: string[] | undefined;
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

    const approvalBranchIds = await defectApprovalBranchIds(
      input.tenantId,
      input.actorUserId,
      input.roleSlugs,
    );
    assertDefectApprover(approvalBranchIds, report.branchId);

    const defCodeId = await reasonStatusService.requireCodeId(
      input.tenantId,
      "inventory_system",
      "DEF",
    );

    const decidedAt = new Date();

    await prisma.$transaction(async (tx) => {
      await lockSerialNumbers(tx, [report.serialNumberId]);
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
      await inventoryApprovalLedger.recordDecision(tx, approvalDocument(input.tenantId, report.id), {
        serialNumberIds: [report.serialNumberId],
        status: "APPROVED",
        decidedById: input.actorUserId,
        decidedAt,
        remarks: input.decisionRemarks,
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
    roleSlugs: string[] | undefined;
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

    const approvalBranchIds = await defectApprovalBranchIds(
      input.tenantId,
      input.actorUserId,
      input.roleSlugs,
    );
    assertDefectApprover(approvalBranchIds, report.branchId);

    const decidedAt = new Date();

    await defectRepository.closeReport({
      tenantId: input.tenantId,
      reportId: report.id,
      status: "rejected",
      deciderUserId: input.actorUserId,
      decidedAt,
      decisionRemarks: input.decisionRemarks,
    });
    await inventoryApprovalLedger.recordDecision(prisma, approvalDocument(input.tenantId, report.id), {
      serialNumberIds: [report.serialNumberId],
      status: "REJECTED",
      decidedById: input.actorUserId,
      decidedAt,
      remarks: input.decisionRemarks,
    });

    const currentCode = report.branchInventory.statusCode.code;
    const currentName = report.branchInventory.statusCode.name;
    await defectRepository.writeDefectHistory({
      tenantId: input.tenantId,
      serialNumberId: report.serialNumberId,
      details: `Defect report rejected — unit remains ${currentName} (${currentCode})${input.decisionRemarks ? `: ${input.decisionRemarks}` : ""}`,
      status: currentCode,
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
