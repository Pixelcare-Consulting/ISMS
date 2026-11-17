"use server";

import { revalidatePath } from "next/cache";

import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { auditService } from "@/features/audit/services/audit.service";
import {
  recordReturnApproved,
  recordReturnEvaluated,
  recordReturnRejected,
  type ReturnApprovalRef,
} from "@/features/inventory-approvals/services/return-approvals";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import {
  RETURNS_APPROVE,
  RETURNS_APPROVALS_VIEW_PERMISSIONS,
  RETURNS_COMPLETE,
  RETURNS_EVALUATE,
  RETURNS_SERVICE_VIEW_PERMISSIONS,
} from "@/features/returns/constants/returns-permissions";
import {
  SC_LOGISTICS_MANAGE,
  SC_ORDERS_APPROVE,
  SC_RETURN_APPROVE,
  SC_RETURN_COMPLETE,
  SC_RETURN_EVALUATE,
  SC_SALES_CREATE,
  scReturnRejectPermissions,
} from "@/features/service-center-ops/constants/sc-permissions";
import { scSalesRepository } from "@/features/service-center-ops/repositories/sc-sales.repository";
import { resolveScIdsForUser } from "@/features/service-center-ops/services/sc-scope";
import { placeServiceCenterUnit } from "@/features/service-center-ops/services/service-center-placement";
import { hasPermission, requireAnyPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/database/client";

/**
 * Existing SC walk-in return steps (evaluate → approve → restore to STK), kept so open
 * requests can finish. SC Sales no longer starts new ones: SC returns and replacements
 * get their own process.
 */

function revalidateScReturns() {
  revalidatePath("/service-centers/sales");
  revalidatePath("/service-centers/inventory");
  revalidatePath("/returns");
}

const saleSerialsSelect = {
  transactionNo: true,
  details: {
    orderBy: { createdAt: "asc" as const },
    select: { serialNumberId: true },
  },
} as const;

function scReturnApproval(
  tenantId: string,
  request: {
    id: string;
    sale: { transactionNo: string; details: Array<{ serialNumberId: string | null }> };
  },
): ReturnApprovalRef {
  return {
    tenantId,
    sourceType: "SC_RETURN",
    sourceId: request.id,
    sourceNo: request.sale.transactionNo,
    serialNumberId:
      request.sale.details.find((detail) => detail.serialNumberId)?.serialNumberId ?? null,
  };
}

export async function listScReturnsAction(input?: {
  page?: number;
  limit?: number;
  statusIn?: Array<"pending_cs" | "pending_tl" | "approved" | "rejected" | "completed">;
}) {
  const forApprovalsQueue = Boolean(input?.statusIn?.length);
  const session = await requireAnyPermission(
    forApprovalsQueue
      ? [...RETURNS_APPROVALS_VIEW_PERMISSIONS]
      : [...RETURNS_SERVICE_VIEW_PERMISSIONS],
  );
  const scopedIds = await resolveScIdsForUser(
    session.user.tenantId,
    session.user.id,
    session.user.permissions,
  );
  return scSalesRepository.listReturnSales(
    session.user.tenantId,
    scopedIds,
    { page: input?.page, limit: parseTablePageSize(input?.limit) },
    { statusIn: input?.statusIn },
  );
}

export async function evaluateScReturnAction(returnRequestId: string, notes?: string) {
  const session = await requireAnyPermission([RETURNS_EVALUATE, SC_RETURN_EVALUATE]);
  const row = await prisma.serviceCenterReturnRequest.findFirst({
    where: { id: returnRequestId, tenantId: session.user.tenantId },
    include: { sale: { select: saleSerialsSelect } },
  });
  if (!row || row.status !== "pending_cs") {
    return { error: "Return request not found or not pending CS evaluation" as const };
  }

  await prisma.$transaction(async (tx) => {
    await tx.serviceCenterReturnRequest.update({
      where: { id: returnRequestId },
      data: {
        status: "pending_tl",
        evaluatedById: session.user.id,
        evaluatedAt: new Date(),
        evaluationNotes: notes,
      },
    });
    await recordReturnEvaluated(tx, scReturnApproval(session.user.tenantId, row), {
      decidedById: session.user.id,
      remarks: notes,
      needsTl: true,
    });
  });

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "sc_return.evaluated",
    entityType: "ServiceCenterReturnRequest",
    entityId: returnRequestId,
  });

  revalidateScReturns();
  return { success: true as const };
}

export async function approveScReturnAction(returnRequestId: string) {
  const session = await requireAnyPermission([
    RETURNS_APPROVE,
    SC_RETURN_APPROVE,
    SC_ORDERS_APPROVE,
  ]);
  const row = await prisma.serviceCenterReturnRequest.findFirst({
    where: { id: returnRequestId, tenantId: session.user.tenantId },
    include: { sale: { select: saleSerialsSelect } },
  });
  if (!row || row.status !== "pending_tl") {
    return { error: "Return request not found or not pending TL approval" as const };
  }

  await prisma.$transaction(async (tx) => {
    await tx.serviceCenterReturnRequest.update({
      where: { id: returnRequestId },
      data: {
        status: "approved",
        approvedById: session.user.id,
        approvedAt: new Date(),
      },
    });
    await recordReturnApproved(tx, scReturnApproval(session.user.tenantId, row), session.user.id);
  });

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "sc_return.approved",
    entityType: "ServiceCenterReturnRequest",
    entityId: returnRequestId,
  });

  revalidateScReturns();
  return { success: true as const };
}

export async function rejectScReturnAction(returnRequestId: string, notes?: string) {
  const session = await requireAnyPermission([
    RETURNS_EVALUATE,
    RETURNS_APPROVE,
    SC_RETURN_EVALUATE,
    SC_RETURN_APPROVE,
    SC_SALES_CREATE,
    SC_ORDERS_APPROVE,
  ]);
  const row = await prisma.serviceCenterReturnRequest.findFirst({
    where: { id: returnRequestId, tenantId: session.user.tenantId },
    include: { sale: { select: saleSerialsSelect } },
  });
  if (!row || !["pending_cs", "pending_tl"].includes(row.status)) {
    return { error: "Return request cannot be rejected" as const };
  }

  const allowed = scReturnRejectPermissions(row.status);
  if (!allowed.some((slug) => hasPermission(session.user.permissions, slug))) {
    return { error: "You do not have permission to reject this return" as const };
  }

  await prisma.$transaction(async (tx) => {
    await tx.serviceCenterReturnRequest.update({
      where: { id: returnRequestId },
      data: { status: "rejected", evaluationNotes: notes ?? row.evaluationNotes },
    });
    await tx.serviceCenterSalesTransaction.update({
      where: { id: row.saleId },
      data: { atrStatus: "open" },
    });
    await recordReturnRejected(tx, scReturnApproval(session.user.tenantId, row), {
      fromStatus: row.status,
      decidedById: session.user.id,
      remarks: notes,
    });
  });

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "sc_return.rejected",
    entityType: "ServiceCenterReturnRequest",
    entityId: returnRequestId,
  });

  revalidateScReturns();
  return { success: true as const };
}

/** Every real serial on the sale goes back to STK at the sale's SC location. */
export async function completeScReturnRestoreAction(returnRequestId: string) {
  const session = await requireAnyPermission([
    RETURNS_COMPLETE,
    SC_RETURN_COMPLETE,
    SC_LOGISTICS_MANAGE,
    SC_SALES_CREATE,
  ]);
  const row = await prisma.serviceCenterReturnRequest.findFirst({
    where: { id: returnRequestId, tenantId: session.user.tenantId },
    include: {
      sale: {
        select: {
          id: true,
          transactionNo: true,
          serviceCenterId: true,
          serviceCenterLocationId: true,
          details: { select: { serialNumberId: true } },
        },
      },
    },
  });
  if (!row || row.status !== "approved") {
    return { error: "Return must be TL-approved before inventory restore" as const };
  }
  const serialIds = row.sale.details
    .map((detail) => detail.serialNumberId)
    .filter((id): id is string => Boolean(id));
  const locationId = row.sale.serviceCenterLocationId;
  if (serialIds.length === 0 || !locationId) {
    return {
      error: "Cannot restore stock — sale has no linked serial or location",
    } as const;
  }

  const stkCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "inventory_system",
    "STK",
  );

  await prisma.$transaction(async (tx) => {
    for (const serialNumberId of serialIds) {
      await placeServiceCenterUnit(tx, {
        tenantId: session.user.tenantId,
        serviceCenterId: row.sale.serviceCenterId,
        serviceCenterLocationId: locationId,
        serialNumberId,
        statusCodeId: stkCodeId,
      });
    }
    await tx.serviceCenterReturnRequest.update({
      where: { id: returnRequestId },
      data: { status: "completed", completedAt: new Date() },
    });
    await tx.serviceCenterSalesTransaction.update({
      where: { id: row.sale.id },
      data: { atrStatus: "closed" },
    });
  });

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "sc_return.completed",
    entityType: "ServiceCenterReturnRequest",
    entityId: returnRequestId,
    metadata: { transactionNo: row.sale.transactionNo, serialCount: serialIds.length },
  });

  revalidateScReturns();
  return { success: true as const };
}
