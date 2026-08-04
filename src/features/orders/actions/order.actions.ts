"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { orderService } from "@/features/orders/services/order.service";
import { orderRepository } from "@/features/orders/repositories/order.repository";
import type {
  OrderListSort,
  OrderListSortDir,
} from "@/features/orders/repositories/order.repository";
import { branchService } from "@/features/branches/services/branch.service";
import { branchRepository } from "@/features/branches/repositories/branch.repository";
import { dealerRepository } from "@/features/dealers/repositories/dealer.repository";
import { orderingPolicyService } from "@/features/ordering/services/ordering-policy.service";
import { checkOrderingAllowed } from "@/features/orders/utils/order-window";
import {
  anyOrderTypePermissions,
  hasAnyOrderPermission,
  hasOrderPermission,
  ORDER_TYPE_ROUTE,
  orderPermissionCandidates,
  orderTypeAccessPermissions,
} from "@/features/orders/constants/order-permissions";
import {
  hasPermission,
  requireAnyPermission,
  requireAuth,
} from "@/lib/auth/permissions";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import type { BranchOrderType } from "@prisma/client";

function hasFullOrderAccess(permissions: string[] | undefined) {
  return (
    hasAnyOrderPermission(permissions, "approve") ||
    hasPermission(permissions, "branches.manage")
  );
}

function revalidateOrderPaths(orderType?: BranchOrderType) {
  revalidatePath("/orders");
  if (orderType) {
    revalidatePath(ORDER_TYPE_ROUTE[orderType]);
  } else {
    revalidatePath("/orders/manual");
    revalidatePath("/orders/special");
    revalidatePath("/orders/auto-replenish");
  }
}

async function requireOrderTypePermission(
  orderType: BranchOrderType,
  action: "view" | "create" | "approve",
) {
  return requireAnyPermission(orderPermissionCandidates(orderType, action));
}

async function requireOrderTypePageAccess(orderType: BranchOrderType) {
  return requireAnyPermission(orderTypeAccessPermissions(orderType));
}

const ORDER_SORT_FIELDS = new Set<OrderListSort>([
  "orderNumber",
  "branch",
  "orderType",
  "status",
]);

function parseOrderSort(value?: string): OrderListSort | undefined {
  if (value && ORDER_SORT_FIELDS.has(value as OrderListSort)) {
    return value as OrderListSort;
  }
  return undefined;
}

function parseOrderSortDir(value?: string): OrderListSortDir | undefined {
  if (value === "asc" || value === "desc") return value;
  return undefined;
}

export async function listOrdersAction(input?: {
  page?: number;
  limit?: number;
  orderType?: BranchOrderType;
  sort?: string;
  sortDir?: string;
}) {
  const session = input?.orderType
    ? await requireOrderTypePageAccess(input.orderType)
    : await requireAnyPermission(anyOrderTypePermissions("view"));
  const limit = parseTablePageSize(input?.limit);
  const result = await orderService.list(
    session.user.tenantId,
    session.user.id,
    hasFullOrderAccess(session.user.permissions),
    { page: input?.page, limit, orderType: input?.orderType },
    { field: parseOrderSort(input?.sort), dir: parseOrderSortDir(input?.sortDir) },
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

export async function getOrdersKpisAction(orderType?: BranchOrderType) {
  const session = orderType
    ? await requireOrderTypePageAccess(orderType)
    : await requireAnyPermission(anyOrderTypePermissions("view"));
  return orderService.getKpis(
    session.user.tenantId,
    session.user.id,
    hasFullOrderAccess(session.user.permissions),
    orderType,
  );
}

export async function listActiveDealersForOrderAction(orderType?: BranchOrderType) {
  const session = orderType
    ? await requireOrderTypePermission(orderType, "create")
    : await requireAnyPermission(anyOrderTypePermissions("create"));
  const dealers = await dealerRepository.listActiveByTenant(session.user.tenantId);
  return dealers.map((d) => ({
    id: d.id,
    name: d.sapCode ? `${d.name} (${d.sapCode})` : d.name,
  }));
}

export async function listBranchesForOrderAction(
  dealerId?: string,
  orderType?: BranchOrderType,
) {
  const session = orderType
    ? await requireOrderTypePermission(orderType, "create")
    : await requireAnyPermission(anyOrderTypePermissions("create"));
  const branches = await branchService.listActiveBranches(
    session.user.tenantId,
    dealerId || null,
  );
  return branches.map((b) => ({
    id: b.id,
    name: b.name,
    dealerId: b.dealerId,
  }));
}

export async function listModelsForOrderAction(
  branchId: string,
  orderType: BranchOrderType = "manual",
) {
  const session = await requireOrderTypePermission(orderType, "create");
  return orderService.listModelsForOrder(
    session.user.tenantId,
    branchId,
    orderType,
  );
}

export async function checkOrderWindowAction(
  branchId: string,
  orderType?: BranchOrderType,
) {
  const session = orderType
    ? await requireOrderTypePermission(orderType, "create")
    : await requireAnyPermission(anyOrderTypePermissions("create"));
  const [policy, ctx] = await Promise.all([
    orderingPolicyService.getPolicy(session.user.tenantId),
    branchRepository.findScheduleContext(session.user.tenantId, branchId),
  ]);
  const reason = checkOrderingAllowed({
    action: "create",
    policy,
    branchName: ctx?.name,
    schedule: ctx?.deliveryScheduleConfig
      ? { orderDays: ctx.deliveryScheduleConfig.orderDays }
      : null,
  });
  return { blocked: reason !== null, reason };
}

export async function createOrderAction(input: {
  branchId: string;
  orderType: "auto_replenish" | "manual" | "special";
  notes?: string;
  details: { modelId: string; quantity: number }[];
}) {
  const session = await requireOrderTypePermission(input.orderType, "create");
  try {
    await orderService.create(session.user.tenantId, session.user.id, input);
    revalidateOrderPaths(input.orderType);
    return { success: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create order" };
  }
}

export async function updateOrderAction(
  orderId: string,
  input: { details: { modelId: string; quantity: number }[] },
) {
  const session = await requireAuth();
  const existing = await orderRepository.findById(session.user.tenantId, orderId);
  if (!existing) {
    return { error: "Order not found" };
  }
  if (!hasOrderPermission(session.user.permissions, existing.orderType, "create")) {
    redirect("/dashboard?error=forbidden");
  }
  try {
    await orderService.updateLines(session.user.tenantId, session.user.id, orderId, {
      hasFullAccess: hasFullOrderAccess(session.user.permissions),
      details: input.details,
    });
    revalidateOrderPaths(existing.orderType);
    return { success: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update order" };
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
  const session = await requireAuth();
  const existing = await orderRepository.findById(session.user.tenantId, orderId);
  if (!existing) {
    return { error: "Order not found" };
  }
  if (!hasOrderPermission(session.user.permissions, existing.orderType, "approve")) {
    redirect("/dashboard?error=forbidden");
  }
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
    revalidateOrderPaths(existing.orderType);
    revalidatePath("/logistics/deliveries");
    revalidatePath("/operations");
    return { success: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to approve order" };
  }
}

export async function rejectOrderAction(orderId: string, comment?: string) {
  const session = await requireAuth();
  const existing = await orderRepository.findById(session.user.tenantId, orderId);
  if (!existing) {
    return { error: "Order not found" };
  }
  if (!hasOrderPermission(session.user.permissions, existing.orderType, "approve")) {
    redirect("/dashboard?error=forbidden");
  }
  try {
    await orderService.reject(
      session.user.tenantId,
      session.user.id,
      orderId,
      session.user.roleSlugs ?? [],
      comment,
    );
    revalidateOrderPaths(existing.orderType);
    return { success: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to reject order" };
  }
}
