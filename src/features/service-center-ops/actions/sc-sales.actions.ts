"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auditService } from "@/features/audit/services/audit.service";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import {
  SC_ORDERS_APPROVE,
  SC_RETURN_APPROVE,
  SC_RETURN_COMPLETE,
  SC_RETURN_EVALUATE,
  SC_RETURN_REQUEST,
  SC_SALES_CREATE,
  SC_SALES_VIEW,
  SC_LOGISTICS_MANAGE,
  scReturnRejectPermissions,
} from "@/features/service-center-ops/constants/sc-permissions";
import {
  RETURNS_APPROVE,
  RETURNS_APPROVALS_VIEW_PERMISSIONS,
  RETURNS_COMPLETE,
  RETURNS_EVALUATE,
  RETURNS_REQUEST,
  RETURNS_SERVICE_VIEW_PERMISSIONS,
} from "@/features/returns/constants/returns-permissions";
import { scOpsRepository } from "@/features/service-center-ops/repositories/sc-ops.repository";
import {
  assertScInScope,
  resolveScIdsForUser,
} from "@/features/service-center-ops/services/sc-scope";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import {
  hasPermission,
  requireAnyPermission,
  requirePermission,
} from "@/lib/auth/permissions";
import { prisma } from "@/lib/database/client";

function revalidateScSales() {
  revalidatePath("/service-centers/sales");
  revalidatePath("/service-centers/sales/new");
  revalidatePath("/service-centers/inventory");
  revalidatePath("/returns");
}

function nextTxnNo() {
  const stamp = Date.now().toString(36).toUpperCase();
  return `SCS-${stamp}`;
}

export async function listScSalesAction(input?: {
  page?: number;
  limit?: number;
}) {
  const session = await requireAnyPermission([
    SC_SALES_VIEW,
    SC_SALES_CREATE,
  ]);
  const scopedIds = await resolveScIdsForUser(
    session.user.tenantId,
    session.user.id,
    session.user.permissions,
  );
  return scOpsRepository.listSales(session.user.tenantId, scopedIds, {
    page: input?.page,
    limit: parseTablePageSize(input?.limit),
  });
}

/** Service Returns ledger — sales that already have a return request. */
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
  return scOpsRepository.listReturnSales(
    session.user.tenantId,
    scopedIds,
    {
      page: input?.page,
      limit: parseTablePageSize(input?.limit),
    },
    { statusIn: input?.statusIn },
  );
}

export async function listScStkSerialsAction(
  serviceCenterId: string,
  serviceCenterLocationId: string,
) {
  const session = await requirePermission(SC_SALES_CREATE);
  const scopedIds = await resolveScIdsForUser(
    session.user.tenantId,
    session.user.id,
    session.user.permissions,
  );
  try {
    assertScInScope(serviceCenterId, scopedIds);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Out of scope" as const };
  }

  const stkCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "inventory_system",
    "STK",
  );

  const rows = await prisma.serviceCenterInventory.findMany({
    where: {
      tenantId: session.user.tenantId,
      serviceCenterId,
      serviceCenterLocationId,
      statusCodeId: stkCodeId,
    },
    include: {
      serialNumber: {
        include: { model: { select: { skuCode: true, name: true } } },
      },
    },
    orderBy: { serialNumber: { serialNo: "asc" } },
    take: 200,
  });

  return {
    success: true as const,
    items: rows.map((r) => ({
      serialNumberId: r.serialNumberId,
      serialNo: r.serialNumber.serialNo,
      skuCode: r.serialNumber.model.skuCode,
      modelName: r.serialNumber.model.name,
    })),
  };
}

export async function createScSaleAction(input: unknown) {
  const session = await requirePermission(SC_SALES_CREATE);
  const parsed = z
    .object({
      serviceCenterId: z.string().min(1),
      serviceCenterLocationId: z.string().min(1),
      serialNumberId: z.string().min(1),
      customerName: z.string().max(120).optional().nullable(),
      amount: z.number().nonnegative().optional().default(0),
      reserved: z.boolean().optional().default(false),
      notes: z.string().max(500).optional().nullable(),
    })
    .safeParse(input);
  if (!parsed.success) return { error: "Invalid input" as const };

  const scopedIds = await resolveScIdsForUser(
    session.user.tenantId,
    session.user.id,
    session.user.permissions,
  );
  try {
    assertScInScope(parsed.data.serviceCenterId, scopedIds);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Out of scope" as const };
  }

  const location = await prisma.serviceCenterLocation.findFirst({
    where: {
      id: parsed.data.serviceCenterLocationId,
      serviceCenterId: parsed.data.serviceCenterId,
      serviceCenter: { tenantId: session.user.tenantId, deletedAt: null },
    },
    select: { id: true },
  });
  if (!location) return { error: "Service center location not found" as const };

  const stkCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "inventory_system",
    "STK",
  );
  const targetCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "inventory_system",
    parsed.data.reserved ? "RSV" : "SLD",
  );

  const transactionNo = nextTxnNo();

  try {
    const sale = await prisma.$transaction(async (tx) => {
      const moved = await tx.serviceCenterInventory.updateMany({
        where: {
          tenantId: session.user.tenantId,
          serviceCenterId: parsed.data.serviceCenterId,
          serviceCenterLocationId: parsed.data.serviceCenterLocationId,
          serialNumberId: parsed.data.serialNumberId,
          statusCodeId: stkCodeId,
        },
        data: { statusCodeId: targetCodeId },
      });
      if (moved.count === 0) {
        throw new Error("Serial is not STK at this service center location");
      }

      return tx.serviceCenterSalesTransaction.create({
        data: {
          tenantId: session.user.tenantId,
          serviceCenterId: parsed.data.serviceCenterId,
          serviceCenterLocationId: parsed.data.serviceCenterLocationId,
          serialNumberId: parsed.data.serialNumberId,
          transactionNo,
          transactionDate: new Date(),
          customerName: parsed.data.customerName?.trim() || null,
          amount: parsed.data.amount,
          atrStatus: "open",
          notes: parsed.data.notes?.trim() || null,
        },
      });
    });

    await auditService.log({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: parsed.data.reserved ? "sc_sale.reserved" : "sc_sale.created",
      entityType: "ServiceCenterSalesTransaction",
      entityId: sale.id,
      metadata: { transactionNo },
    });

    revalidateScSales();
    return { success: true as const, id: sale.id, transactionNo };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to record sale" as const };
  }
}

export async function requestScReturnAction(saleId: string, notes?: string) {
  const session = await requireAnyPermission([
    RETURNS_REQUEST,
    SC_RETURN_REQUEST,
    SC_SALES_CREATE,
  ]);
  const reason = notes?.trim() || "";
  if (!reason) return { error: "Return reason is required" as const };

  const sale = await prisma.serviceCenterSalesTransaction.findFirst({
    where: { id: saleId, tenantId: session.user.tenantId },
    select: {
      id: true,
      transactionNo: true,
      atrStatus: true,
      notes: true,
      returnRequest: { select: { id: true } },
    },
  });
  if (!sale) return { error: "Sale not found" as const };
  if (sale.returnRequest) return { error: "Return already requested" as const };
  if (sale.atrStatus !== "open") {
    return { error: "Sale is not eligible for return" as const };
  }

  await prisma.$transaction([
    prisma.serviceCenterReturnRequest.create({
      data: {
        tenantId: session.user.tenantId,
        saleId,
        requestedById: session.user.id,
        requestNotes: reason,
      },
    }),
    prisma.serviceCenterSalesTransaction.update({
      where: { id: saleId },
      data: {
        atrStatus: "reserve",
        notes: [sale.notes, `[Return requested] ${reason}`]
          .filter(Boolean)
          .join("\n"),
      },
    }),
  ]);

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "sc_sale.return_requested",
    entityType: "ServiceCenterSalesTransaction",
    entityId: saleId,
    metadata: { transactionNo: sale.transactionNo },
  });

  revalidateScSales();
  return { success: true as const };
}

export async function evaluateScReturnAction(
  returnRequestId: string,
  notes?: string,
) {
  const session = await requireAnyPermission([
    RETURNS_EVALUATE,
    SC_RETURN_EVALUATE,
  ]);
  const row = await prisma.serviceCenterReturnRequest.findFirst({
    where: { id: returnRequestId, tenantId: session.user.tenantId },
  });
  if (!row || row.status !== "pending_cs") {
    return { error: "Return request not found or not pending CS evaluation" as const };
  }

  await prisma.serviceCenterReturnRequest.update({
    where: { id: returnRequestId },
    data: {
      status: "pending_tl",
      evaluatedById: session.user.id,
      evaluatedAt: new Date(),
      evaluationNotes: notes,
    },
  });

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "sc_return.evaluated",
    entityType: "ServiceCenterReturnRequest",
    entityId: returnRequestId,
  });

  revalidateScSales();
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
  });
  if (!row || row.status !== "pending_tl") {
    return { error: "Return request not found or not pending TL approval" as const };
  }

  await prisma.serviceCenterReturnRequest.update({
    where: { id: returnRequestId },
    data: {
      status: "approved",
      approvedById: session.user.id,
      approvedAt: new Date(),
    },
  });

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "sc_return.approved",
    entityType: "ServiceCenterReturnRequest",
    entityId: returnRequestId,
  });

  revalidateScSales();
  return { success: true as const };
}

export async function rejectScReturnAction(
  returnRequestId: string,
  notes?: string,
) {
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
    include: { sale: true },
  });
  if (!row || !["pending_cs", "pending_tl"].includes(row.status)) {
    return { error: "Return request cannot be rejected" as const };
  }

  const allowed = scReturnRejectPermissions(row.status);
  if (!allowed.some((slug) => hasPermission(session.user.permissions, slug))) {
    return { error: "You do not have permission to reject this return" as const };
  }

  await prisma.$transaction([
    prisma.serviceCenterReturnRequest.update({
      where: { id: returnRequestId },
      data: { status: "rejected", evaluationNotes: notes ?? row.evaluationNotes },
    }),
    prisma.serviceCenterSalesTransaction.update({
      where: { id: row.saleId },
      data: { atrStatus: "open" },
    }),
  ]);

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "sc_return.rejected",
    entityType: "ServiceCenterReturnRequest",
    entityId: returnRequestId,
  });

  revalidateScSales();
  return { success: true as const };
}

export async function completeScReturnRestoreAction(returnRequestId: string) {
  const session = await requireAnyPermission([
    RETURNS_COMPLETE,
    SC_RETURN_COMPLETE,
    SC_LOGISTICS_MANAGE,
    SC_SALES_CREATE,
  ]);
  const row = await prisma.serviceCenterReturnRequest.findFirst({
    where: { id: returnRequestId, tenantId: session.user.tenantId },
    include: { sale: true },
  });
  if (!row || row.status !== "approved") {
    return { error: "Return must be TL-approved before inventory restore" as const };
  }
  if (!row.sale.serialNumberId || !row.sale.serviceCenterLocationId) {
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
    await tx.serviceCenterInventory.upsert({
      where: {
        serviceCenterLocationId_serialNumberId: {
          serviceCenterLocationId: row.sale.serviceCenterLocationId!,
          serialNumberId: row.sale.serialNumberId!,
        },
      },
      update: {
        statusCodeId: stkCodeId,
        serviceCenterId: row.sale.serviceCenterId,
      },
      create: {
        tenantId: session.user.tenantId,
        serviceCenterId: row.sale.serviceCenterId,
        serviceCenterLocationId: row.sale.serviceCenterLocationId!,
        serialNumberId: row.sale.serialNumberId!,
        statusCodeId: stkCodeId,
      },
    });
    await tx.serviceCenterReturnRequest.update({
      where: { id: returnRequestId },
      data: { status: "completed", completedAt: new Date() },
    });
    await tx.serviceCenterSalesTransaction.update({
      where: { id: row.saleId },
      data: { atrStatus: "closed" },
    });
  });

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "sc_return.completed",
    entityType: "ServiceCenterReturnRequest",
    entityId: returnRequestId,
    metadata: { transactionNo: row.sale.transactionNo },
  });

  revalidateScSales();
  return { success: true as const };
}
