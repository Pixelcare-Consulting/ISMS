import type { BranchOrderType } from "@prisma/client";

import { getUserBranchIds } from "@/lib/aor/scope";
import { hasPermission, requireAnyPermission } from "@/lib/auth/permissions";
import { resolveActiveOrderPrice } from "@/features/master-data/utils/resolve-active-order-price";
import {
  hasAnyOrderPermission,
  orderTypeAccessPermissions,
} from "@/features/orders/constants/order-permissions";
import { orderRepository } from "@/features/orders/repositories/order.repository";
import type { OrderHistoryDetail } from "@/features/orders/types/order-analytics";

function hasFullOrderAccess(permissions: string[] | undefined) {
  return (
    hasAnyOrderPermission(permissions, "approve") ||
    hasPermission(permissions, "branches.manage")
  );
}

async function resolveOrderBranchScope(
  tenantId: string,
  userId: string,
  permissions: string[] | undefined,
): Promise<string[] | null> {
  if (hasFullOrderAccess(permissions)) return null;
  return getUserBranchIds(tenantId, userId);
}

function lastUpdatedByName(order: {
  createdBy: { name: string | null; email: string };
  approvalLevels: {
    approvedAt: Date | null;
    rejectedAt: Date | null;
    approvedBy: { name: string | null; email: string } | null;
  }[];
}): string {
  const actors = order.approvalLevels
    .map((level) => {
      const at = level.approvedAt ?? level.rejectedAt;
      return at && level.approvedBy ? { at, person: level.approvedBy } : null;
    })
    .filter((row): row is { at: Date; person: { name: string | null; email: string } } => row !== null)
    .sort((a, b) => b.at.getTime() - a.at.getTime());
  const person = actors[0]?.person ?? order.createdBy;
  return person.name?.trim() || person.email;
}

/** Order History page. Same branch scope as the history list. Null when the order is out of scope. */
export async function getOrderHistoryDetail(
  orderType: BranchOrderType,
  orderId: string,
): Promise<OrderHistoryDetail | null> {
  const session = await requireAnyPermission(orderTypeAccessPermissions(orderType));
  const branchScope = await resolveOrderBranchScope(
    session.user.tenantId,
    session.user.id,
    session.user.permissions,
  );
  const order = await orderRepository.findScopedById(
    session.user.tenantId,
    orderId,
    branchScope,
    orderType,
  );
  if (!order) return null;

  let orderQty = 0;
  let appQty = 0;
  let totalAmt = 0;
  let appAmt = 0;
  const lines = order.details.map((detail) => {
    const srp = resolveActiveOrderPrice(detail.model.priceLists, detail.model.srp);
    const approved = detail.approvedQty ?? 0;
    orderQty += detail.quantity;
    appQty += approved;
    totalAmt += detail.quantity * srp;
    appAmt += approved * srp;
    return {
      detailId: detail.id,
      modelId: detail.model.id,
      skuCode: detail.model.skuCode,
      name: detail.model.name,
      quantity: detail.quantity,
      approvedQty: detail.approvedQty,
      remarks: detail.remarks,
      spRemarks: detail.spRemarks,
      amount: detail.quantity * srp,
      approvedAmount: detail.approvedQty == null ? null : detail.approvedQty * srp,
    };
  });

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    orderType: order.orderType,
    status: order.status,
    branchId: order.branchId,
    branchName: order.branch.name,
    brandId: order.brandId,
    notes: order.notes,
    deliveryDueDate: order.deliveryDueDate?.toISOString() ?? null,
    createdByName: order.createdBy.name?.trim() || order.createdBy.email,
    reviewSnapshot: order.reviewSnapshot,
    reviewSnapshotAt: order.reviewSnapshotAt?.toISOString() ?? null,
    sapDocType: order.sapDocType,
    sapDocNum: order.sapDocNum,
    orderQty,
    totalAmt,
    appQty,
    appAmt,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    processedAt: order.processedAt?.toISOString() ?? null,
    lastUpdatedBy: lastUpdatedByName(order),
    lines,
    approvalLevels: order.approvalLevels.map((level) => ({
      level: level.level,
      roleSlug: level.roleSlug,
      approvedAt: level.approvedAt?.toISOString() ?? null,
      rejectedAt: level.rejectedAt?.toISOString() ?? null,
      comment: level.comment,
      approvedBy: level.approvedBy
        ? { name: level.approvedBy.name, email: level.approvedBy.email }
        : null,
    })),
  };
}
