import type { BranchOrderSource, BranchOrderStatus, BranchOrderType } from "@prisma/client";

import { BRANCH_ORDER_STATUS_LABELS } from "@/features/orders/constants/order-status";
import {
  holdsOrderStep,
  orderStepPermission,
} from "@/features/orders/constants/order-step-permissions";

export type OrderApprovalStage = "tl" | "sp";

export interface OrderApprovalStep {
  level: number;
  /** Written to approval history (`role_slug`) and used for its labels. Never an access check. */
  roleSlug: OrderApprovalStage;
  status: BranchOrderStatus;
  label: string;
  /** Checkbox that lets a person act at this step. */
  permission: string;
}

const STAGE_ACTION = { tl: "approve_tl", sp: "approve_sp" } as const;
const STAGE_LABEL = { tl: "Team Leader", sp: "Supply Planning" } as const;

function step(
  orderType: BranchOrderType,
  level: number,
  stage: OrderApprovalStage,
): OrderApprovalStep {
  return {
    level,
    roleSlug: stage,
    status: stage === "tl" ? "pending_tl" : "pending_sp",
    label: STAGE_LABEL[stage],
    permission: orderStepPermission(orderType, STAGE_ACTION[stage]),
  };
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
    case "manual":
      return [step(orderType, 1, "sp")];
    case "auto_replenish":
      return [step(orderType, 1, "tl"), step(orderType, 2, "sp")];
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

/** Holds the type's Supply Planning approval checkbox. */
export function holdsSupplyPlanningStep(
  orderType: BranchOrderType,
  permissions: readonly string[] | undefined,
): boolean {
  return holdsOrderStep(permissions, orderType, "approve_sp");
}

/**
 * Whether this person may approve or decline at the order's current step.
 * Legacy `pending_ps` / `pending_logistics` rows (no new orders reach them) are decided
 * by the type's Supply Planning approval holders.
 */
export function canApproveOrder(
  status: BranchOrderStatus,
  orderType: BranchOrderType,
  permissions: readonly string[] | undefined,
): boolean {
  if (status === "pending_logistics" || (status === "pending_ps" && orderType === "manual")) {
    return holdsSupplyPlanningStep(orderType, permissions);
  }
  const current = getOrderApprovalChain(orderType).find((s) => s.status === status);
  if (!current) return false;
  return permissions?.includes(current.permission) ?? false;
}

/**
 * Supply Planning may cancel an order it approved while its ITR/SO is in SAP. Whether
 * anything was copied from that document yet is checked against SAP on cancel.
 */
export function canCancelApprovedOrder(
  order: {
    status: BranchOrderStatus;
    orderType: BranchOrderType;
    source: BranchOrderSource;
    sapDocEntry: number | null;
  },
  permissions: readonly string[] | undefined,
): boolean {
  return (
    order.status === "approved" &&
    order.source === "ISMS" &&
    order.sapDocEntry != null &&
    holdsSupplyPlanningStep(order.orderType, permissions)
  );
}

/** "Edit while Pending SP": change Manual lines before Supply Planning decides. */
export function canOptionallyEditManualOrder(permissions: readonly string[] | undefined): boolean {
  return holdsOrderStep(permissions, "manual", "edit_pending");
}

/** SP remarks on lines are saved only by the Supply Planning step. */
export function canPersistSpRemarks(
  status: BranchOrderStatus,
  orderType: BranchOrderType,
  permissions: readonly string[] | undefined,
): boolean {
  return status === "pending_sp" && holdsSupplyPlanningStep(orderType, permissions);
}

/**
 * Whether the viewer may edit order lines for this status/type.
 * Create permission covers drafts (and Manual pending_sp for PS creators).
 * Optional Manual editors (PS/TL) can edit Manual pending_sp without create.
 */
export function canEditOrderLines(opts: {
  status: BranchOrderStatus;
  orderType: BranchOrderType;
  permissions: readonly string[] | undefined;
  hasCreatePermission: boolean;
}): boolean {
  if (!isOrderEditable(opts.status, opts.orderType)) return false;
  if (opts.hasCreatePermission) return true;
  return (
    opts.orderType === "manual" &&
    opts.status === "pending_sp" &&
    canOptionallyEditManualOrder(opts.permissions)
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
  const current = getOrderApprovalChain(orderType).find((s) => s.status === status);
  return current?.roleSlug === "sp";
}

export function getApprovalLevelForStatus(
  status: BranchOrderStatus,
  orderType: BranchOrderType,
): number {
  const current = getOrderApprovalChain(orderType).find((s) => s.status === status);
  if (current) return current.level;
  if (status === "pending_logistics") return 4;
  return 1;
}

export function getRoleSlugForApproval(
  status: BranchOrderStatus,
  orderType: BranchOrderType,
): string {
  const current = getOrderApprovalChain(orderType).find((s) => s.status === status);
  if (current) return current.roleSlug;
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

/** "See every pending step": the full live pipeline for this type. */
export function canViewFullOrderQueue(
  orderType: BranchOrderType,
  permissions: readonly string[] | undefined,
): boolean {
  return holdsOrderStep(permissions, orderType, "view_queue");
}

/**
 * Manual and special lists show only the viewer's own orders unless they hold
 * "See everyone's orders" for that type. Auto replenish has no creator limit.
 */
export function isOwnOrdersOnly(
  orderType: BranchOrderType,
  permissions: readonly string[] | undefined,
): boolean {
  if (orderType === "auto_replenish") return false;
  return !holdsOrderStep(permissions, orderType, "view_all");
}

/** Direct order pages use the same creator limit as the manual and special lists. */
export function mayViewOrder(input: {
  orderType: BranchOrderType;
  permissions: readonly string[] | undefined;
  viewerUserId: string;
  createdById: string;
}): boolean {
  if (!isOwnOrdersOnly(input.orderType, input.permissions)) return true;
  return input.createdById === input.viewerUserId;
}

/**
 * Statuses shown on the Orders tab for this viewer.
 * Each person sees the steps they can act on (plus drafts if they can create).
 * For Manual, "Edit while Pending SP" also shows pending_sp.
 * "See every pending step" shows the full live pipeline. Finished orders stay in History.
 */
export function getOrderQueueStatuses(
  orderType: BranchOrderType,
  permissions: readonly string[] | undefined,
  options?: { includeDraft?: boolean },
): BranchOrderStatus[] {
  if (canViewFullOrderQueue(orderType, permissions)) {
    return [...ORDER_QUEUE_STATUSES];
  }

  return ORDER_QUEUE_STATUSES.filter((status) => {
    if (status === "draft") return Boolean(options?.includeDraft);
    if (canApproveOrder(status, orderType, permissions)) return true;
    return (
      orderType === "manual" &&
      status === "pending_sp" &&
      canOptionallyEditManualOrder(permissions)
    );
  });
}

/**
 * Sidebar badge: only steps this person can act on (never drafts).
 * "See every pending step" counts every live pending step except draft.
 * Optional Manual edit visibility does not inflate the badge.
 */
export function getOrderActionableQueueStatuses(
  orderType: BranchOrderType,
  permissions: readonly string[] | undefined,
): BranchOrderStatus[] {
  if (canViewFullOrderQueue(orderType, permissions)) {
    return ORDER_QUEUE_STATUSES.filter((status) => status !== "draft");
  }
  return ORDER_QUEUE_STATUSES.filter(
    (status) =>
      status !== "draft" && canApproveOrder(status, orderType, permissions),
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

/** Live pending queue rows "Cancel any pending order" may force to Cancelled (Order History). */
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
