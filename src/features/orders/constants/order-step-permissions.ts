import type { BranchOrderType } from "@prisma/client";

/**
 * Workflow checkboxes for branch orders. Each rule that used to check a role slug
 * (`tl`, `sp`, `ps`, `tenant_admin`, `super_admin`) checks one of these instead, so
 * Settings → Roles alone decides who acts at each step. Client-safe: no server imports.
 */

export const ORDER_TYPE_PERMISSION_PREFIX: Record<BranchOrderType, string> = {
  manual: "orders.manual",
  special: "orders.special",
  auto_replenish: "orders.auto_replenish",
};

export type OrderStepAction =
  /** Team Leader review (Pending TL). */
  | "approve_tl"
  /** Supply Planning approval (Pending SP): approve, cancel request, SP remarks, cancel approved. */
  | "approve_sp"
  /** Edit lines while Pending SP without Create. */
  | "edit_pending"
  /** See orders other people created. Without it the list shows only the viewer's own. */
  | "view_all"
  /** See every live step on the Orders tab, not only the steps the viewer can act on. */
  | "view_queue"
  /** Cancel or discard any pending order from the Orders list. */
  | "force_cancel";

/** Step actions each order type offers. A type without an action never grants it. */
export const ORDER_STEP_ACTIONS: Record<BranchOrderType, readonly OrderStepAction[]> = {
  manual: ["approve_sp", "edit_pending", "view_all", "view_queue", "force_cancel"],
  special: ["approve_sp", "view_all", "view_queue", "force_cancel"],
  auto_replenish: ["approve_tl", "approve_sp", "view_queue", "force_cancel"],
};

/** Approval steps per type: they also open the order pages, like the old Approve checkbox. */
export const ORDER_APPROVAL_STEP_ACTIONS = ["approve_tl", "approve_sp"] as const satisfies readonly OrderStepAction[];

export function orderStepPermission(orderType: BranchOrderType, action: OrderStepAction): string {
  return `${ORDER_TYPE_PERMISSION_PREFIX[orderType]}.${action}`;
}

export function holdsOrderStep(
  permissions: readonly string[] | undefined,
  orderType: BranchOrderType,
  action: OrderStepAction,
): boolean {
  if (!ORDER_STEP_ACTIONS[orderType].includes(action)) return false;
  return permissions?.includes(orderStepPermission(orderType, action)) ?? false;
}

/** Approval-step keys of one type, for page access lists. */
export function orderApprovalStepPermissions(orderType: BranchOrderType): string[] {
  return ORDER_APPROVAL_STEP_ACTIONS.filter((action) =>
    ORDER_STEP_ACTIONS[orderType].includes(action),
  ).map((action) => orderStepPermission(orderType, action));
}

/** Holds `action` for at least one order type (e.g. show the bulk cancel controls). */
export function holdsOrderStepForAnyType(
  permissions: readonly string[] | undefined,
  action: OrderStepAction,
): boolean {
  return (Object.keys(ORDER_STEP_ACTIONS) as BranchOrderType[]).some((orderType) =>
    holdsOrderStep(permissions, orderType, action),
  );
}
