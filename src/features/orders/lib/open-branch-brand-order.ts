import type { BranchOrderStatus, BranchOrderType } from "@prisma/client";

import { BRANCH_ORDER_TYPE_LABELS } from "@/features/orders/constants/order-status";

/** Still in progress. Approved, rejected, and cancelled do not block a new order. */
export const OPEN_BRANCH_ORDER_STATUSES = [
  "draft",
  "pending_ps",
  "pending_tl",
  "pending_sp",
  "pending_logistics",
] as const satisfies readonly BranchOrderStatus[];

/** Auto replenish, Manual, and Special all count for the same branch and brand. */
export const BLOCKING_BRANCH_ORDER_TYPES = [
  "auto_replenish",
  "manual",
  "special",
] as const satisfies readonly BranchOrderType[];

export const OPEN_BRANCH_BRAND_ORDER_TITLE = "This branch already has an open order";

const OPEN_BRANCH_BRAND_ORDER_CLOSING =
  "You can create another after that order is approved, rejected, or cancelled.";

export const MISSING_ORDER_BRAND_MESSAGE = "Choose one brand for this order.";

export const MIXED_ORDER_BRAND_MESSAGE =
  "This order is for one brand. Remove models from another brand.";

export interface OpenBranchBrandOrder {
  orderNumber: string;
  orderType: BranchOrderType;
  branchName: string;
  brandName: string;
}

export function isOpenBranchOrderStatus(status: BranchOrderStatus): boolean {
  switch (status) {
    case "draft":
    case "pending_ps":
    case "pending_tl":
    case "pending_sp":
    case "pending_logistics":
      return true;
    case "approved":
    case "rejected":
    case "cancelled":
      return false;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/** Orders that block a new Manual or Special order for this branch and brand. */
export function openBranchBrandOrderWhere(tenantId: string, branchId: string, brandId: string) {
  return {
    tenantId,
    branchId,
    orderType: { in: [...BLOCKING_BRANCH_ORDER_TYPES] },
    status: { in: [...OPEN_BRANCH_ORDER_STATUSES] },
    OR: [{ brandId }, { details: { some: { model: { brandId } } } }],
  };
}

export function openBranchBrandOrderMessage(order: OpenBranchBrandOrder): string {
  const typeLabel = BRANCH_ORDER_TYPE_LABELS[order.orderType];
  return `${order.branchName} already has an open ${typeLabel} order (${order.orderNumber}) for ${order.brandName}. ${OPEN_BRANCH_BRAND_ORDER_CLOSING}`;
}

export function isOpenBranchBrandOrderMessage(message: string): boolean {
  return message.includes(OPEN_BRANCH_BRAND_ORDER_CLOSING);
}
