import type { BranchOrderType } from "@prisma/client";

import {
  holdsOrderStep,
  ORDER_TYPE_PERMISSION_PREFIX,
  orderApprovalStepPermissions,
} from "@/features/orders/constants/order-step-permissions";
import { hasPermission } from "@/lib/auth/permissions";

export { ORDER_TYPE_PERMISSION_PREFIX };

export type OrderPermissionAction = "view" | "create" | "approve";

/** Paths also live in order-type-route.ts so client components do not import this file. */
export const ORDER_TYPE_ROUTE: Record<BranchOrderType, string> = {
  manual: "/orders/manual",
  special: "/orders/special",
  auto_replenish: "/orders/auto-replenish",
};

export const ORDER_TYPE_NAV_LABEL: Record<BranchOrderType, string> = {
  manual: "Manual Order",
  special: "Special Order",
  auto_replenish: "Auto replenish",
};

export const BRANCH_ORDER_TYPES = [
  "manual",
  "special",
  "auto_replenish",
] as const satisfies readonly BranchOrderType[];

export function orderTypePermission(
  orderType: BranchOrderType,
  action: OrderPermissionAction,
): string {
  return `${ORDER_TYPE_PERMISSION_PREFIX[orderType]}.${action}`;
}

/**
 * The order type's own checkbox. The hidden legacy `orders.<action>` slug no longer counts:
 * it is not in the role editor, so it could not be unticked. For `approve` the old per-type
 * Approve is hidden too, so only the type's approval-step checkboxes count (Supply Planning
 * approval, Team Leader review). Who may act at a step is decided by `canApproveOrder`.
 */
export function orderPermissionCandidates(
  orderType: BranchOrderType,
  action: OrderPermissionAction,
): string[] {
  return action === "approve"
    ? orderApprovalStepPermissions(orderType)
    : [orderTypePermission(orderType, action)];
}

export function anyOrderTypePermissions(action: OrderPermissionAction): string[] {
  return [
    ...new Set(BRANCH_ORDER_TYPES.flatMap((type) => orderPermissionCandidates(type, action))),
  ];
}

/** Nav / page access: view, create, or approve for the type. */
export function orderTypeAccessPermissions(orderType: BranchOrderType): string[] {
  return [
    ...orderPermissionCandidates(orderType, "view"),
    ...orderPermissionCandidates(orderType, "create"),
    ...orderPermissionCandidates(orderType, "approve"),
  ];
}

export function hasOrderPermission(
  permissions: string[] | undefined,
  orderType: BranchOrderType,
  action: OrderPermissionAction,
): boolean {
  return orderPermissionCandidates(orderType, action).some((slug) =>
    hasPermission(permissions, slug),
  );
}

export function hasAnyOrderPermission(
  permissions: string[] | undefined,
  action: OrderPermissionAction,
): boolean {
  return anyOrderTypePermissions(action).some((slug) =>
    hasPermission(permissions, slug),
  );
}

/** Cancel or discard any pending order of this type from the Orders list. */
export function canForceCancelOrderType(
  permissions: string[] | undefined,
  orderType: BranchOrderType,
): boolean {
  return holdsOrderStep(permissions, orderType, "force_cancel");
}

export function canAccessOrderType(
  permissions: string[] | undefined,
  orderType: BranchOrderType,
): boolean {
  return (
    hasOrderPermission(permissions, orderType, "view") ||
    hasOrderPermission(permissions, orderType, "create") ||
    hasOrderPermission(permissions, orderType, "approve")
  );
}

export function firstAccessibleOrderType(
  permissions: string[] | undefined,
): BranchOrderType | null {
  for (const type of BRANCH_ORDER_TYPES) {
    if (canAccessOrderType(permissions, type)) {
      return type;
    }
  }
  return null;
}

/**
 * Orders home. Manual and Special share `/orders/manual`.
 * Auto replenish is the home only when the viewer cannot open either of those.
 */
export function ordersHomeHref(permissions: string[] | undefined): string | null {
  if (
    canAccessOrderType(permissions, "manual") ||
    canAccessOrderType(permissions, "special")
  ) {
    return ORDER_TYPE_ROUTE.manual;
  }
  if (canAccessOrderType(permissions, "auto_replenish")) {
    return ORDER_TYPE_ROUTE.auto_replenish;
  }
  return null;
}

/** Slugs that satisfy report pages gated on “orders view”. */
export const ORDER_VIEW_REPORT_PERMISSIONS = anyOrderTypePermissions("view");
