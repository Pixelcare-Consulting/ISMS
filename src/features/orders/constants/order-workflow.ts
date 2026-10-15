import type { BranchOrderStatus, BranchOrderType } from "@prisma/client";

import { BRANCH_ORDER_STATUS_LABELS } from "@/features/orders/constants/order-status";

export interface OrderApprovalStep {
  level: number;
  roleSlug: string;
  status: BranchOrderStatus;
  label: string;
}

/**
 * Signed FINDEN Process II (Ordering):
 * - PS creates Manual Orders; they go straight to Supply Planning.
 *   Team Leaders may optionally edit while Pending SP (no TL approval gate).
 * - A special order is created and submitted by TL, then SP.
 * - SP approves or cancels. Approval queues the SAP stand-in for ITR (OWTQ) + SO (ORDR).
 *   That job does not move stock. A date outside the delivery window is rescheduled.
 * - Auto-replenish still starts with TL, then SP.
 * Logistics fulfills after SP approval. It is not an order approval gate.
 */
export function getOrderApprovalChain(orderType: BranchOrderType): OrderApprovalStep[] {
  switch (orderType) {
    case "special":
      return [{ level: 1, roleSlug: "sp", status: "pending_sp", label: "Supply Planning" }];
    case "auto_replenish":
      return [
        { level: 1, roleSlug: "tl", status: "pending_tl", label: "Team Leader" },
        { level: 2, roleSlug: "sp", status: "pending_sp", label: "Supply Planning" },
      ];
    case "manual":
      return [{ level: 1, roleSlug: "sp", status: "pending_sp", label: "Supply Planning" }];
    default:
      return [
        { level: 1, roleSlug: "tl", status: "pending_tl", label: "Team Leader" },
        { level: 2, roleSlug: "sp", status: "pending_sp", label: "Supply Planning" },
      ];
  }
}

export function getInitialOrderStatus(orderType: BranchOrderType): BranchOrderStatus {
  // Manual requests go straight to Supply Planning (TL may optionally edit).
  if (orderType === "manual") return "pending_sp";
  return getOrderApprovalChain(orderType)[0]?.status ?? "pending_tl";
}

export function nextStatusAfterApprove(
  current: BranchOrderStatus,
  orderType: BranchOrderType,
): BranchOrderStatus {
  if (current === "pending_logistics") return "approved";
  // Older manual requests may still be waiting on the product specialist — skip TL.
  if (current === "pending_ps" && orderType === "manual") return "pending_sp";

  const chain = getOrderApprovalChain(orderType);
  const idx = chain.findIndex((step) => step.status === current);
  if (idx === -1) {
    if (current === "draft") return chain[0]?.status ?? "pending_tl";
    return current;
  }
  if (idx >= chain.length - 1) return "approved";
  return chain[idx + 1].status;
}

/** Roles that may perform Supply Planning (SP) final approval — includes SPA aliases. */
export const SUPPLY_PLANNING_APPROVER_SLUGS = [
  "sp",
  "spa",
  "supply_planning",
  "supply_planning_associate",
] as const;

export function canApproveOrder(
  status: BranchOrderStatus,
  orderType: BranchOrderType,
  roleSlugs: string[],
): boolean {
  if (status === "pending_logistics" && roleSlugs.includes("logistics")) {
    return true;
  }
  if (status === "pending_ps" && orderType === "manual" && roleSlugs.includes("ps")) {
    return true;
  }

  const step = getOrderApprovalChain(orderType).find((s) => s.status === status);
  if (!step) return false;
  if (step.roleSlug === "sp") {
    return SUPPLY_PLANNING_APPROVER_SLUGS.some((slug) => roleSlugs.includes(slug));
  }
  return roleSlugs.includes(step.roleSlug);
}

/** PS / TL may optionally edit Manual orders while they await Supply Planning. */
export function canOptionallyEditManualOrder(roleSlugs: string[]): boolean {
  return roleSlugs.includes("ps") || roleSlugs.includes("tl");
}

/**
 * Whether the viewer may edit order lines for this status/type.
 * Create permission covers drafts (and Manual pending_sp for PS creators).
 * Optional Manual editors (PS/TL) can edit Manual pending_sp without create.
 */
export function canEditOrderLines(opts: {
  status: BranchOrderStatus;
  orderType: BranchOrderType;
  roleSlugs: string[];
  hasCreatePermission: boolean;
}): boolean {
  if (!isOrderEditable(opts.status, opts.orderType)) return false;
  if (opts.hasCreatePermission) return true;
  return (
    opts.orderType === "manual" &&
    opts.status === "pending_sp" &&
    canOptionallyEditManualOrder(opts.roleSlugs)
  );
}

/** SP's no on the signed sheet is Cancel Request. Earlier steps stay a rejection. */
export function declineOrderStatus(
  status: BranchOrderStatus,
  orderType: BranchOrderType,
): "cancelled" | "rejected" {
  return isSupplyPlanningApprovalStep(status, orderType) ? "cancelled" : "rejected";
}

export function isSupplyPlanningApprovalStep(
  status: BranchOrderStatus,
  orderType: BranchOrderType,
): boolean {
  const step = getOrderApprovalChain(orderType).find((s) => s.status === status);
  return step?.roleSlug === "sp";
}

export function getApprovalLevelForStatus(
  status: BranchOrderStatus,
  orderType: BranchOrderType,
): number {
  const step = getOrderApprovalChain(orderType).find((s) => s.status === status);
  if (step) return step.level;
  if (status === "pending_logistics") return 4;
  return 1;
}

export function getRoleSlugForApproval(
  status: BranchOrderStatus,
  orderType: BranchOrderType,
): string {
  const step = getOrderApprovalChain(orderType).find((s) => s.status === status);
  if (step) return step.roleSlug;
  if (status === "pending_logistics") return "logistics";
  return "reviewer";
}

export function isOrderPendingApproval(status: BranchOrderStatus): boolean {
  return ["pending_ps", "pending_tl", "pending_sp", "pending_logistics"].includes(status);
}

/** Live work-queue statuses — finished requests belong in Order History. */
export const ORDER_QUEUE_STATUSES = [
  "draft",
  "pending_ps",
  "pending_tl",
  "pending_sp",
  "pending_logistics",
] as const satisfies readonly BranchOrderStatus[];

export const ORDER_HISTORY_ONLY_STATUSES = [
  "approved",
  "rejected",
  "cancelled",
] as const satisfies readonly BranchOrderStatus[];

type OrderLifecycleStatus =
  | (typeof ORDER_QUEUE_STATUSES)[number]
  | (typeof ORDER_HISTORY_ONLY_STATUSES)[number];
const _allStatusesPartitioned: Record<BranchOrderStatus, OrderLifecycleStatus> = {
  draft: "draft",
  pending_ps: "pending_ps",
  pending_tl: "pending_tl",
  pending_sp: "pending_sp",
  pending_logistics: "pending_logistics",
  approved: "approved",
  rejected: "rejected",
  cancelled: "cancelled",
};
void _allStatusesPartitioned;

const ORDER_QUEUE_OVERSIGHT_ROLE_SLUGS = ["super_admin", "tenant_admin"] as const;

export function isOrderQueueOversightRole(roleSlugs: string[]): boolean {
  return ORDER_QUEUE_OVERSIGHT_ROLE_SLUGS.some((slug) => roleSlugs.includes(slug));
}

/**
 * Statuses shown on the Orders tab for this viewer.
 * Workflow roles only see the step they can review (plus drafts if they can create).
 * For Manual, PS/TL also see pending_sp so they can optionally edit before SP decides.
 * Tenant / Super Admin see the full live pipeline. Approved / rejected / cancelled stay in History.
 */
export function getOrderQueueStatuses(
  orderType: BranchOrderType,
  roleSlugs: string[],
  options?: { includeDraft?: boolean },
): BranchOrderStatus[] {
  if (isOrderQueueOversightRole(roleSlugs)) {
    return [...ORDER_QUEUE_STATUSES];
  }

  return ORDER_QUEUE_STATUSES.filter((status) => {
    if (status === "draft") return Boolean(options?.includeDraft);
    if (canApproveOrder(status, orderType, roleSlugs)) return true;
    return (
      orderType === "manual" &&
      status === "pending_sp" &&
      canOptionallyEditManualOrder(roleSlugs)
    );
  });
}

/**
 * Sidebar badge: only approval/review steps this role can act on (never drafts).
 * Oversight roles see every live pending step except draft.
 * Optional Manual edit visibility does not inflate the badge.
 */
export function getOrderActionableQueueStatuses(
  orderType: BranchOrderType,
  roleSlugs: string[],
): BranchOrderStatus[] {
  if (isOrderQueueOversightRole(roleSlugs)) {
    return ORDER_QUEUE_STATUSES.filter((status) => status !== "draft");
  }
  return ORDER_QUEUE_STATUSES.filter(
    (status) =>
      status !== "draft" && canApproveOrder(status, orderType, roleSlugs),
  );
}

/**
 * Whether a branch may still edit an order's lines.
 * Drafts are always editable. Manual orders stay editable while Pending SP
 * so PS/TL can adjust before Supply Planning decides. Freeze after SP acts.
 * Editing also requires the branch to be within its ordering window
 * (enforced separately in the order service).
 */
export function isOrderEditable(
  status: BranchOrderStatus,
  orderType?: BranchOrderType,
): boolean {
  if (status === "draft") return true;
  return orderType === "manual" && status === "pending_sp";
}

/** Hard-delete is allowed only for unsubmitted draft rows (e.g. Suggested auto-replenish). */
export function canDeleteDraftOrder(opts: { status: BranchOrderStatus }): boolean {
  return opts.status === "draft";
}

/** Super Admin bulk cancel / discard on the Orders list (not Tenant Admin). */
export function isSuperAdminOrderOverride(roleSlugs: string[]): boolean {
  return roleSlugs.includes("super_admin");
}

/** Live pending queue rows a Super Admin may force to Cancelled (Order History). */
export function canAdminForceCancelOrder(opts: { status: BranchOrderStatus }): boolean {
  return isOrderPendingApproval(opts.status);
}

export const ORDER_WORKFLOW_DESCRIPTION =
  "Manual: PS submits → Pending SP (TL may optionally edit) → Supply Planning approves or cancels. Special: TL submits, SP approves or cancels. Auto-replenish: TL then SP. Approval opens a delivery. It does not move stock.";

export function getOrderStatusLabel(status: BranchOrderStatus): string {
  return BRANCH_ORDER_STATUS_LABELS[status] ?? status;
}

export function getCurrentApproverLabel(
  status: BranchOrderStatus,
  orderType: BranchOrderType,
): string {
  const step = getOrderApprovalChain(orderType).find((s) => s.status === status);
  return step ? `Awaiting: ${step.label}` : "";
}

/** User-facing message when Review is disabled for the current viewer role. */
export function getOrderReviewDenialReason(
  status: BranchOrderStatus,
  orderType: BranchOrderType,
): string {
  if (status === "pending_logistics") {
    return "Only Logistics can review orders at this step.";
  }
  const step = getOrderApprovalChain(orderType).find((s) => s.status === status);
  if (!step) {
    return "You are not the designated approver for this order step.";
  }
  return `Only ${step.label} can review and approve this order right now.`;
}

export function getAfterApproveHint(
  status: BranchOrderStatus,
  orderType: BranchOrderType,
): string {
  const nextStatus = nextStatusAfterApprove(status, orderType);
  if (nextStatus === "approved") {
    return "After approve → Approved. A delivery opens. Warehouse stock stays put until logistics dispatches it.";
  }
  const step = getOrderApprovalChain(orderType).find((s) => s.status === nextStatus);
  return step ? `After approve → ${step.label}` : "";
}
