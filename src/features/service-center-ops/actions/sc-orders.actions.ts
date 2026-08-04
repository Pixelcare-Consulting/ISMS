"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auditService } from "@/features/audit/services/audit.service";
import {
  SC_ORDERS_APPROVE,
  SC_ORDERS_CREATE,
  SC_ORDERS_VIEW,
} from "@/features/service-center-ops/constants/sc-permissions";
import { scOpsRepository } from "@/features/service-center-ops/repositories/sc-ops.repository";
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

function nextOrderNo() {
  return `SCO-${Date.now().toString(36).toUpperCase()}`;
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

export async function createScOrderAction(input: unknown) {
  const session = await requirePermission(SC_ORDERS_CREATE);
  const parsed = z
    .object({
      serviceCenterId: z.string().min(1),
      serviceCenterLocationId: z.string().min(1).optional().nullable(),
      notes: z.string().max(500).optional().nullable(),
      lines: z
        .array(
          z.object({
            modelId: z.string().min(1),
            quantity: z.number().int().positive(),
          }),
        )
        .min(1),
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

  const modelIds = [...new Set(parsed.data.lines.map((l) => l.modelId))];
  const models = await prisma.productModel.findMany({
    where: { id: { in: modelIds }, tenantId: session.user.tenantId },
    select: { id: true },
  });
  if (models.length !== modelIds.length) {
    return { error: "One or more models not found" as const };
  }

  const orderNumber = nextOrderNo();
  const order = await prisma.serviceCenterOrder.create({
    data: {
      tenantId: session.user.tenantId,
      serviceCenterId: parsed.data.serviceCenterId,
      serviceCenterLocationId: parsed.data.serviceCenterLocationId ?? null,
      orderType: "manual",
      status: "pending_tl",
      orderNumber,
      notes: parsed.data.notes?.trim() || null,
      createdById: session.user.id,
      details: {
        create: parsed.data.lines.map((line) => ({
          modelId: line.modelId,
          quantity: line.quantity,
          approvedQty: line.quantity,
        })),
      },
      approvalLevels: {
        create: [{ level: 1, roleSlug: "tl" }],
      },
    },
  });

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "sc_order.created",
    entityType: "ServiceCenterOrder",
    entityId: order.id,
    metadata: { orderNumber },
  });

  revalidateScOrders();
  return { success: true as const, id: order.id, orderNumber };
}

export async function approveScOrderAction(orderId: string) {
  const session = await requirePermission(SC_ORDERS_APPROVE);
  const order = await prisma.serviceCenterOrder.findFirst({
    where: { id: orderId, tenantId: session.user.tenantId },
    include: { details: true },
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
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Out of scope" as const };
  }

  await prisma.$transaction([
    prisma.serviceCenterOrder.update({
      where: { id: orderId },
      data: { status: "approved" },
    }),
    prisma.serviceCenterOrderApprovalLevel.updateMany({
      where: { orderId, approvedAt: null, rejectedAt: null },
      data: { approvedAt: new Date(), approvedById: session.user.id },
    }),
  ]);

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "sc_order.approved",
    entityType: "ServiceCenterOrder",
    entityId: orderId,
    metadata: { orderNumber: order.orderNumber },
  });

  revalidateScOrders();
  return { success: true as const };
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
