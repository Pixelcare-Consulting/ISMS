import type { BranchOrderStatus, BranchOrderType } from "@prisma/client";

export const BRANCH_ORDER_STATUS_LABELS: Record<BranchOrderStatus, string> = {
  draft: "Draft",
  pending_ps: "Pending PS",
  pending_tl: "Pending TL",
  pending_sp: "Pending SP",
  pending_logistics: "Pending Logistics",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export const BRANCH_ORDER_TYPE_LABELS: Record<BranchOrderType, string> = {
  auto_replenish: "Auto replenish",
  manual: "Manual",
  special: "Special",
};

/** @deprecated Use getOrderApprovalChain(orderType) — chains vary by order type. */
export const ORDER_APPROVAL_CHAIN = [
  { level: 1, roleSlug: "tl", label: "Team Leader" },
  { level: 2, roleSlug: "sp", label: "Supply Planning" },
] as const;
