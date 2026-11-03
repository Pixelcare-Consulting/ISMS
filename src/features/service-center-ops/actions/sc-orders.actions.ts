"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  SC_ORDERS_APPROVE,
  SC_ORDERS_CREATE,
  SC_ORDERS_VIEW,
} from "@/features/service-center-ops/constants/sc-permissions";
import { scOpsRepository } from "@/features/service-center-ops/repositories/sc-ops.repository";
import {
  SAP_CODE_MAX,
  SC_ORDER_PO_NUMBER_MAX,
  SC_ORDERING_NOT_SET_UP,
} from "@/features/service-center-ordering/constants";
import { loadScOrderWorksheet } from "@/features/service-center-ordering/services/sc-order-worksheet";
import { scOrderingSettingsService } from "@/features/service-center-ordering/services/sc-ordering-settings.service";
import { scOrderService } from "@/features/service-center-ordering/services/sc-order.service";
import {
  assertScInScope,
  resolveScIdsForUser,
} from "@/features/service-center-ops/services/sc-scope";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { requireAnyPermission, requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/database/client";

function revalidateScOrders() {
  revalidatePath("/service-centers/orders");
  revalidatePath("/service-centers/deliveries");
}

export async function listScOrdersAction(input?: {
  page?: number;
  limit?: number;
}) {
  const session = await requireAnyPermission([
    SC_ORDERS_VIEW,
    SC_ORDERS_CREATE,
    SC_ORDERS_APPROVE,
  ]);
  const scopedIds = await resolveScIdsForUser(
    session.user.tenantId,
    session.user.id,
    session.user.permissions,
  );
  return scOpsRepository.listOrders(session.user.tenantId, scopedIds, {
    page: input?.page,
    limit: parseTablePageSize(input?.limit),
  });
}

const createOrderSchema = z.object({
  serviceCenterId: z.string().min(1),
  serviceCenterLocationId: z.string().min(1).optional().nullable(),
  cardCode: z.string().trim().max(SAP_CODE_MAX).optional().nullable(),
  poNumber: z.string().trim().max(SC_ORDER_PO_NUMBER_MAX).optional().nullable(),
  projectCode: z.string().trim().max(SAP_CODE_MAX).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  lines: z
    .array(
      z.object({
        modelId: z.string().min(1),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
});

export async function createScOrderAction(input: unknown) {
  const session = await requirePermission(SC_ORDERS_CREATE);
  const parsed = createOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const scopedIds = await resolveScIdsForUser(
    session.user.tenantId,
    session.user.id,
    session.user.permissions,
  );
  try {
    assertScInScope(parsed.data.serviceCenterId, scopedIds);
    const order = await scOrderService.create(session.user.tenantId, session.user.id, parsed.data);
    revalidateScOrders();
    return { success: true as const, id: order.id, orderNumber: order.orderNumber };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create order" };
  }
}

export async function approveScOrderAction(orderId: string) {
  const session = await requirePermission(SC_ORDERS_APPROVE);
  const order = await prisma.serviceCenterOrder.findFirst({
    where: { id: orderId, tenantId: session.user.tenantId },
    select: { id: true, orderNumber: true, status: true, serviceCenterId: true },
  });
  if (!order) return { error: "Order not found" as const };
  if (order.status !== "pending_tl" && order.status !== "pending_sp") {
    return { error: "Order is not pending approval" as const };
  }

  const scopedIds = await resolveScIdsForUser(
    session.user.tenantId,
    session.user.id,
    session.user.permissions,
  );
  try {
    assertScInScope(order.serviceCenterId, scopedIds);
    await scOrderService.approve(session.user.tenantId, session.user.id, order);
  } catch (e) {
    revalidateScOrders();
    return { error: e instanceof Error ? e.message : "Failed to approve order" };
  }

  revalidateScOrders();
  const posted = await prisma.serviceCenterOrder.findFirst({
    where: { id: order.id, tenantId: session.user.tenantId },
    select: { sapDocNum: true },
  });
  return { success: true as const, sapDocNum: posted?.sapDocNum ?? null };
}

export async function rejectScOrderAction(orderId: string, comment?: string) {
  const session = await requirePermission(SC_ORDERS_APPROVE);
  const order = await prisma.serviceCenterOrder.findFirst({
    where: { id: orderId, tenantId: session.user.tenantId },
  });
  if (!order) return { error: "Order not found" as const };
  if (!["pending_tl", "pending_sp"].includes(order.status)) {
    return { error: "Order cannot be rejected" as const };
  }

  await prisma.$transaction([
    prisma.serviceCenterOrder.update({
      where: { id: orderId },
      data: { status: "rejected" },
    }),
    prisma.serviceCenterOrderApprovalLevel.updateMany({
      where: { orderId, approvedAt: null, rejectedAt: null },
      data: {
        rejectedAt: new Date(),
        approvedById: session.user.id,
        comment: comment?.trim() || null,
      },
    }),
  ]);

  revalidateScOrders();
  return { success: true as const };
}

export async function listModelsForScOrderAction(query?: string) {
  const session = await requirePermission(SC_ORDERS_CREATE);
  const q = query?.trim() ?? "";
  return prisma.productModel.findMany({
    where: {
      tenantId: session.user.tenantId,
      ...(q
        ? {
            OR: [
              { skuCode: { contains: q, mode: "insensitive" } },
              { name: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: { id: true, skuCode: true, name: true },
    orderBy: { skuCode: "asc" },
    take: 40,
  });
}

/** The models the service-center order form lists: what SAP has available in the Settings warehouse. */
export async function getScOrderWorksheetAction() {
  const session = await requirePermission(SC_ORDERS_CREATE);
  try {
    const { defaults } = await scOrderingSettingsService.get(session.user.tenantId);
    if (!defaults.warehouseCode) return { error: SC_ORDERING_NOT_SET_UP };
    return {
      success: true as const,
      data: await loadScOrderWorksheet(session.user.tenantId, defaults.warehouseCode),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to load warehouse stock" };
  }
}
