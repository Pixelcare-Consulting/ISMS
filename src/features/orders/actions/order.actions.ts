"use server";

import { revalidatePath } from "next/cache";
import { orderService } from "@/features/orders/services/order.service";
import { branchService } from "@/features/branches/services/branch.service";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import type { BranchOrderType } from "@prisma/client";

function hasFullOrderAccess(permissions: string[] | undefined) {
  return (
    hasPermission(permissions, "orders.approve") ||
    hasPermission(permissions, "branches.manage")
  );
}

export async function listOrdersAction(input?: { page?: number }) {
  const session = await requirePermission("orders.view");
  const result = await orderService.list(
    session.user.tenantId,
    session.user.id,
    hasFullOrderAccess(session.user.permissions),
    { page: input?.page },
  );
  return {
    ...result,
    items: result.items.map((o) => ({
      ...o,
      orderNumber: o.orderNumber,
      details: o.details.map((d) => ({
        id: d.id,
        quantity: d.quantity,
        approvedQty: d.approvedQty,
        model: { ...d.model, sku: d.model.skuCode },
      })),
    })),
  };
}

export async function listBranchesForOrderAction() {
  const session = await requirePermission("orders.create");
  const branches = await branchService.listBranches(session.user.tenantId);
  return branches.map((b) => ({ id: b.id, name: b.name }));
}

export async function listModelsForOrderAction(
  branchId: string,
  orderType: BranchOrderType = "manual",
) {
  const session = await requirePermission("orders.create");
  return orderService.listModelsForOrder(
    session.user.tenantId,
    branchId,
    orderType,
  );
}

export async function createOrderAction(input: {
  branchId: string;
  orderType: "auto_replenish" | "manual" | "special";
  notes?: string;
  details: { modelId: string; quantity: number }[];
}) {
  const session = await requirePermission("orders.create");
  try {
    await orderService.create(session.user.tenantId, session.user.id, input);
    revalidatePath("/orders");
    return { success: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create order" };
  }
}

export async function approveOrderAction(
  orderId: string,
  input?: {
    comment?: string;
    lineAdjustments?: { detailId: string; approvedQty: number }[];
    deliveryDueDate?: string;
  },
) {
  const session = await requirePermission("orders.approve");
  try {
    await orderService.approve(
      session.user.tenantId,
      session.user.id,
      orderId,
      session.user.roleSlugs ?? [],
      input
        ? {
            comment: input.comment,
            lineAdjustments: input.lineAdjustments,
            deliveryDueDate: input.deliveryDueDate
              ? new Date(input.deliveryDueDate)
              : undefined,
          }
        : undefined,
    );
    revalidatePath("/orders");
    revalidatePath("/logistics/deliveries");
    revalidatePath("/operations");
    return { success: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to approve order" };
  }
}

export async function rejectOrderAction(orderId: string, comment?: string) {
  const session = await requirePermission("orders.approve");
  try {
    await orderService.reject(
      session.user.tenantId,
      session.user.id,
      orderId,
      session.user.roleSlugs ?? [],
      comment,
    );
    revalidatePath("/orders");
    return { success: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to reject order" };
  }
}
