import type { BranchOrderStatus, BranchOrderType } from "@prisma/client";

import { BRANCH_ORDER_STATUS_LABELS } from "@/features/orders/constants/order-status";

export interface OrderApprovalStep {
  level: number;
  roleSlug: string;
  status: BranchOrderStatus;
  label: string;
}

/**
 * Per FINDEN ISMS Process Flow swimlanes (Ordering):
 * - Auto-replenish: system form → TL review (optional) → SP approval → logistics delivery
 * - Manual: system form → PS review (required) → TL review (optional) → SP approval
 * - Special: TL creates form → SP approval
 * Logistics is fulfillment after SP approval — not an order approval gate.
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
      return [
        { level: 1, roleSlug: "ps", status: "pending_ps", label: "Product Specialist" },
        { level: 2, roleSlug: "tl", status: "pending_tl", label: "Team Leader" },
        { level: 3, roleSlug: "sp", status: "pending_sp", label: "Supply Planning" },
      ];
    default:
      return [
        { level: 1, roleSlug: "tl", status: "pending_tl", label: "Team Leader" },
        { level: 2, roleSlug: "sp", status: "pending_sp", label: "Supply Planning" },
      ];
  }
}

export function getInitialOrderStatus(orderType: BranchOrderType): BranchOrderStatus {
  return getOrderApprovalChain(orderType)[0]?.status ?? "pending_tl";
}

export function nextStatusAfterApprove(
  current: BranchOrderStatus,
  orderType: BranchOrderType,
): BranchOrderStatus {
  if (current === "pending_logistics") return "approved";

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

  const step = getOrderApprovalChain(orderType).find((s) => s.status === status);
  if (!step) return false;
  if (step.roleSlug === "sp") {
    return SUPPLY_PLANNING_APPROVER_SLUGS.some((slug) => roleSlugs.includes(slug));
  }
  return roleSlugs.includes(step.roleSlug);
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

export const ORDER_WORKFLOW_DESCRIPTION =
  "Auto-replenish: TL → SP. Manual: PS → TL → SP. Special: TL creates → SP. Approved orders queue logistics delivery (DIT → Stock).";

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

export function getAfterApproveHint(
  status: BranchOrderStatus,
  orderType: BranchOrderType,
): string {
  const nextStatus = nextStatusAfterApprove(status, orderType);
  if (nextStatus === "approved") {
    return "After approve → Approved (logistics delivery queued)";
  }
  const step = getOrderApprovalChain(orderType).find((s) => s.status === nextStatus);
  return step ? `After approve → ${step.label}` : "";
}

