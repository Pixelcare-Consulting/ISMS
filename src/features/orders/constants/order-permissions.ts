import type { BranchOrderType } from "@prisma/client";

import { hasPermission } from "@/lib/auth/permissions";

export type OrderPermissionAction = "view" | "create" | "approve";

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

export const ORDER_TYPE_PERMISSION_PREFIX: Record<BranchOrderType, string> = {
  manual: "orders.manual",
  special: "orders.special",
  auto_replenish: "orders.auto_replenish",
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

/** Type-specific slug plus legacy `orders.<action>` for pre-reseed tenants. */
export function orderPermissionCandidates(
  orderType: BranchOrderType,
  action: OrderPermissionAction,
): string[] {
  return [orderTypePermission(orderType, action), `orders.${action}`];
}

export function anyOrderTypePermissions(action: OrderPermissionAction): string[] {
  return [
    `orders.${action}`,
    ...BRANCH_ORDER_TYPES.map((type) => orderTypePermission(type, action)),
  ];
}

/** Nav / page access: view, create, or approve for the type (or legacy). */
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

/** Slugs that satisfy report pages gated on “orders view”. */
export const ORDER_VIEW_REPORT_PERMISSIONS = anyOrderTypePermissions("view");
