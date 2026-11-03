import type { BranchOrderStatus } from "@prisma/client";

/**
 * Status choices on the Order summary report. Drafts are never listed: they are not
 * requests yet. Values are the API/dataset contract; labels are what users see.
 */
export const ORDER_SUMMARY_STATUS_GROUPS = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;

export type OrderSummaryStatusGroup = (typeof ORDER_SUMMARY_STATUS_GROUPS)[number];

export const ORDER_SUMMARY_STATUS_LABELS: Record<OrderSummaryStatusGroup, string> = {
  PENDING: "Pending approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

export const ORDER_SUMMARY_GROUP_STATUSES: Record<OrderSummaryStatusGroup, readonly BranchOrderStatus[]> = {
  PENDING: ["pending_ps", "pending_tl", "pending_sp", "pending_logistics"],
  APPROVED: ["approved"],
  REJECTED: ["rejected"],
  CANCELLED: ["cancelled"],
};

/** Order statuses for the chosen groups; none chosen means every non-draft status. */
export function orderSummaryStatuses(groups: readonly OrderSummaryStatusGroup[] | undefined): BranchOrderStatus[] {
  const chosen = groups && groups.length > 0 ? groups : ORDER_SUMMARY_STATUS_GROUPS;
  return [...new Set(chosen.flatMap((group) => ORDER_SUMMARY_GROUP_STATUSES[group]))];
}
