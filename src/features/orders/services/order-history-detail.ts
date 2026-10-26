import type { BranchOrderStatus, BranchOrderType } from "@prisma/client";

import { getUserBranchIds } from "@/lib/aor/scope";
import { prisma } from "@/lib/database/client";
import { hasPermission, requireAnyPermission } from "@/lib/auth/permissions";
import { decimalToNumberOrNull } from "@/lib/database/decimal";
import { resolveActiveOrderPrice } from "@/features/master-data/utils/resolve-active-order-price";
import { formatOrderModeOfPayment } from "@/features/orders/constants/order-sap-doc-type";
import {
  canAccessOrderType,
  hasAnyOrderPermission,
  orderTypeAccessPermissions,
} from "@/features/orders/constants/order-permissions";
import { orderRepository } from "@/features/orders/repositories/order.repository";
import type {
  OrderHistoryDetail,
  OrderHistoryLinkedDelivery,
} from "@/features/orders/types/order-analytics";

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

/** The order's one delivery, for its stored status and a link. No status is derived. */
async function findLinkedDelivery(
  tenantId: string,
  orderId: string,
  branchIds: string[] | null,
): Promise<OrderHistoryLinkedDelivery | null> {
  const delivery = await prisma.branchDelivery.findFirst({
    where: {
      tenantId,
      orderId,
      ...(branchIds === null ? {} : { branchId: { in: branchIds } }),
    },
    select: {
      id: true,
      deliveryNo: true,
      statusCode: { select: { code: true, name: true, color: true } },
    },
  });
  if (!delivery) return null;
  return {
    id: delivery.id,
    deliveryNo: delivery.deliveryNo,
    status: {
      code: delivery.statusCode.code,
      name: delivery.statusCode.name,
      color: delivery.statusCode.color,
    },
  };
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

  const delivery = await findLinkedDelivery(session.user.tenantId, order.id, branchScope);

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
    delivery,
  };
}

export interface SubmittedOrderLine {
  id: string;
  skuCode: string;
  name: string;
  quantity: number;
  /** Stored line amount. Null when the order has no amount for this line. */
  amount: number | null;
}

export interface SubmittedOrderSummary {
  id: string;
  orderNumber: string;
  orderType: "manual" | "special";
  status: BranchOrderStatus;
  dealerName: string | null;
  branchName: string;
  /** Resolved payment name, or null when the order has none. */
  paymentLabel: string | null;
  createdAt: string;
  processedAt: string | null;
  createdByName: string;
  lines: SubmittedOrderLine[];
  approvalLevels: {
    level: number;
    approvedAt: string | null;
    rejectedAt: string | null;
    actorName: string | null;
  }[];
}

/**
 * Saved manual or special order for the page after submit.
 * Null when it is missing, out of branch scope, or the viewer cannot open that order type.
 */
export async function getSubmittedOrderSummary(
  orderId: string,
): Promise<SubmittedOrderSummary | null> {
  const session = await requireAnyPermission([
    ...orderTypeAccessPermissions("manual"),
    ...orderTypeAccessPermissions("special"),
  ]);
  const branchScope = await resolveOrderBranchScope(
    session.user.tenantId,
    session.user.id,
    session.user.permissions,
  );
  const order = await orderRepository.findManualOrSpecialById(
    session.user.tenantId,
    orderId,
    branchScope,
  );
  if (!order) return null;
  if (order.orderType !== "manual" && order.orderType !== "special") return null;
  if (!canAccessOrderType(session.user.permissions, order.orderType)) return null;

  const orderPayment = order.modeOfPayment?.name?.trim() || null;
  const dealerPayment = order.branch.dealer?.modeOfPayment?.name?.trim() || null;
  const paymentLabel =
    orderPayment || dealerPayment
      ? formatOrderModeOfPayment({
          orderModeOfPayment: orderPayment,
          dealerModeOfPayment: dealerPayment,
        })
      : null;

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    orderType: order.orderType,
    status: order.status,
    dealerName: order.branch.dealer?.name?.trim() || null,
    branchName: order.branch.name,
    paymentLabel: paymentLabel === "—" ? null : paymentLabel,
    createdAt: order.createdAt.toISOString(),
    processedAt: order.processedAt?.toISOString() ?? null,
    createdByName: order.createdBy.name?.trim() || order.createdBy.email,
    lines: order.details.map((detail) => ({
      id: detail.id,
      skuCode: detail.model.skuCode,
      name: detail.model.name,
      quantity: detail.quantity,
      amount: decimalToNumberOrNull(detail.amount),
    })),
    approvalLevels: order.approvalLevels.map((level) => ({
      level: level.level,
      approvedAt: level.approvedAt?.toISOString() ?? null,
      rejectedAt: level.rejectedAt?.toISOString() ?? null,
      actorName: level.approvedBy?.name?.trim() || level.approvedBy?.email || null,
    })),
  };
}
