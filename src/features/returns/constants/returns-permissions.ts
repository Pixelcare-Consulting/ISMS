import {
  resolveCapabilities,
  type ResolvedCapabilities,
} from "@/lib/auth/action-capabilities";
import { hasPermission } from "@/lib/auth/permissions";

/**
 * Returns / Replacement action-button permissions.
 *
 * Recipe: see `src/lib/auth/action-capabilities.ts`.
 * The hidden legacy `sales.return.*` and `service_centers.return.*` slugs grant nothing.
 *
 * Tab visibility:
 * - Branch → `returns.branch.view` (or umbrella `returns.view`); lists every
 *   branch sale return, Service Return / Replacement document types included
 * - There is no Service tab: SC Service Returns are finished under Service → SC Returns
 * - Approvals → evaluate / approve / complete (no separate approvals.view key)
 */

export const RETURNS_VIEW = "returns.view";
export const RETURNS_BRANCH_VIEW = "returns.branch.view";
export const RETURNS_SERVICE_VIEW = "returns.service.view";
export const RETURNS_REQUEST = "returns.request";
export const RETURNS_EVALUATE = "returns.evaluate";
export const RETURNS_APPROVE = "returns.approve";
export const RETURNS_COMPLETE = "returns.complete";

export type ReturnsPageTab = "branch" | "approvals";

/** Any of these grants Returns nav + `/returns` page access. */
export const RETURNS_ACCESS_PERMISSIONS = [
  RETURNS_VIEW,
  RETURNS_BRANCH_VIEW,
  RETURNS_SERVICE_VIEW,
  RETURNS_REQUEST,
  RETURNS_EVALUATE,
  RETURNS_APPROVE,
  RETURNS_COMPLETE,
] as const;

/** Branch Returns tab (and branch list server action). */
export const RETURNS_BRANCH_VIEW_PERMISSIONS = [
  RETURNS_BRANCH_VIEW,
  RETURNS_VIEW,
  RETURNS_REQUEST,
] as const;

/** Legacy SC return list server action (the Service tab was removed). */
export const RETURNS_SERVICE_VIEW_PERMISSIONS = [
  RETURNS_SERVICE_VIEW,
  RETURNS_VIEW,
] as const;

/**
 * Approvals tab — reuses workflow perms (evaluate / approve / complete).
 * Umbrella `returns.view` ("View both tabs") also opens it.
 */
export const RETURNS_APPROVALS_VIEW_PERMISSIONS = [
  RETURNS_VIEW,
  RETURNS_EVALUATE,
  RETURNS_APPROVE,
  RETURNS_COMPLETE,
] as const;

/**
 * Each workflow button checks only its own Returns checkbox, for branch and service center
 * returns alike. Sales, Orders, Logistics, and the hidden `sales.return.*` /
 * `service_centers.return.*` slugs no longer unlock them.
 */
export const RETURNS_ACTION_CAPABILITIES = {
  canViewReturns: [RETURNS_VIEW, RETURNS_BRANCH_VIEW, RETURNS_SERVICE_VIEW],
  canViewBranchReturns: [...RETURNS_BRANCH_VIEW_PERMISSIONS],
  canViewApprovals: [...RETURNS_APPROVALS_VIEW_PERMISSIONS],
  canRequestReturn: RETURNS_REQUEST,
  canEvaluateReturn: RETURNS_EVALUATE,
  canApproveReturn: RETURNS_APPROVE,
  canCompleteReturn: RETURNS_COMPLETE,
} as const;

export type ReturnsActionCapabilities = ResolvedCapabilities<
  typeof RETURNS_ACTION_CAPABILITIES
>;

export function resolveReturnsCapabilities(
  permissions: string[] | undefined,
): ReturnsActionCapabilities {
  return resolveCapabilities(permissions, RETURNS_ACTION_CAPABILITIES);
}

export function canAccessReturns(permissions: string[] | undefined): boolean {
  return RETURNS_ACCESS_PERMISSIONS.some((slug) =>
    hasPermission(permissions, slug),
  );
}

export function canViewBranchReturnsTab(
  permissions: string[] | undefined,
): boolean {
  return RETURNS_BRANCH_VIEW_PERMISSIONS.some((slug) =>
    hasPermission(permissions, slug),
  );
}

export function canViewApprovalsTab(
  permissions: string[] | undefined,
): boolean {
  return RETURNS_APPROVALS_VIEW_PERMISSIONS.some((slug) =>
    hasPermission(permissions, slug),
  );
}

/** Ordered tabs the user may open (empty if none). */
export function resolveAllowedReturnsTabs(
  permissions: string[] | undefined,
): ReturnsPageTab[] {
  const tabs: ReturnsPageTab[] = [];
  if (canViewBranchReturnsTab(permissions)) tabs.push("branch");
  if (canViewApprovalsTab(permissions)) tabs.push("approvals");
  return tabs;
}

/**
 * Prefer the requested tab when allowed; otherwise first allowed tab.
 * Returns null when the user has module access but no visible tabs.
 */
export function resolveReturnsActiveTab(
  permissions: string[] | undefined,
  requested: ReturnsPageTab,
): ReturnsPageTab | null {
  const allowed = resolveAllowedReturnsTabs(permissions);
  if (allowed.length === 0) return null;
  if (allowed.includes(requested)) return requested;
  return allowed[0] ?? null;
}

/** Reject at pending_cs → Evaluate; at pending_tl → Approve. */
export function returnsRejectPermissions(status: string): string[] {
  if (status === "pending_cs") return [RETURNS_EVALUATE];
  if (status === "pending_tl") return [RETURNS_APPROVE];
  return [RETURNS_EVALUATE, RETURNS_APPROVE];
}
