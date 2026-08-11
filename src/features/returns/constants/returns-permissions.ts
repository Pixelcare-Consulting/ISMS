import {
  resolveCapabilities,
  type ResolvedCapabilities,
} from "@/lib/auth/action-capabilities";
import { hasPermission } from "@/lib/auth/permissions";

/**
 * Returns / Replacement action-button permissions.
 *
 * Recipe: see `src/lib/auth/action-capabilities.ts`.
 * Legacy `sales.return.*` and `service_centers.return.*` remain aliases.
 *
 * Tab visibility:
 * - Branch → `returns.branch.view` (or umbrella `returns.view` / legacy)
 * - Service → `returns.service.view` (or umbrella / SC return aliases)
 * - Approvals → evaluate / approve / complete (no separate approvals.view key)
 */

export const RETURNS_VIEW = "returns.view";
export const RETURNS_BRANCH_VIEW = "returns.branch.view";
export const RETURNS_SERVICE_VIEW = "returns.service.view";
export const RETURNS_REQUEST = "returns.request";
export const RETURNS_EVALUATE = "returns.evaluate";
export const RETURNS_APPROVE = "returns.approve";
export const RETURNS_COMPLETE = "returns.complete";

export type ReturnsPageTab = "branch" | "service" | "approvals";

/** Any of these grants Returns nav + `/returns` page access. */
export const RETURNS_ACCESS_PERMISSIONS = [
  RETURNS_VIEW,
  RETURNS_BRANCH_VIEW,
  RETURNS_SERVICE_VIEW,
  RETURNS_REQUEST,
  RETURNS_EVALUATE,
  RETURNS_APPROVE,
  RETURNS_COMPLETE,
  "sales.return.view",
  "sales.return.request",
  "sales.return.evaluate",
  "sales.return.approve",
  "sales.return.complete",
  "service_centers.return.request",
  "service_centers.return.evaluate",
  "service_centers.return.approve",
  "service_centers.return.complete",
] as const;

/** Branch Returns tab (and branch list server action). */
export const RETURNS_BRANCH_VIEW_PERMISSIONS = [
  RETURNS_BRANCH_VIEW,
  RETURNS_VIEW,
  RETURNS_REQUEST,
  "sales.return.view",
  "sales.return.request",
] as const;

/** Service Returns tab (and SC list server action). */
export const RETURNS_SERVICE_VIEW_PERMISSIONS = [
  RETURNS_SERVICE_VIEW,
  RETURNS_VIEW,
  "service_centers.return.request",
  "service_centers.return.evaluate",
  "service_centers.return.approve",
  "service_centers.return.complete",
] as const;

/**
 * Approvals tab — reuses workflow perms (evaluate / approve / complete).
 * Umbrella `returns.view` keeps legacy “see everything” roles working.
 */
export const RETURNS_APPROVALS_VIEW_PERMISSIONS = [
  RETURNS_VIEW,
  RETURNS_EVALUATE,
  RETURNS_APPROVE,
  RETURNS_COMPLETE,
  "sales.return.evaluate",
  "sales.return.approve",
  "sales.return.complete",
  "service_centers.return.evaluate",
  "service_centers.return.approve",
  "service_centers.return.complete",
] as const;

export const RETURNS_ACTION_CAPABILITIES = {
  canViewReturns: [
    RETURNS_VIEW,
    RETURNS_BRANCH_VIEW,
    RETURNS_SERVICE_VIEW,
    "sales.return.view",
    "service_centers.return.request",
    "service_centers.return.evaluate",
    "service_centers.return.approve",
    "service_centers.return.complete",
  ],
  canViewBranchReturns: [...RETURNS_BRANCH_VIEW_PERMISSIONS],
  canViewServiceReturns: [...RETURNS_SERVICE_VIEW_PERMISSIONS],
  canViewApprovals: [...RETURNS_APPROVALS_VIEW_PERMISSIONS],
  canRequestReturn: [
    RETURNS_REQUEST,
    "sales.return.request",
    "sales.create",
    "service_centers.return.request",
    "service_centers.sales.create",
  ],
  canEvaluateReturn: [
    RETURNS_EVALUATE,
    "sales.return.evaluate",
    "service_centers.return.evaluate",
  ],
  canApproveReturn: [
    RETURNS_APPROVE,
    "sales.return.approve",
    "orders.approve",
    "service_centers.return.approve",
    "service_centers.orders.approve",
  ],
  canCompleteReturn: [
    RETURNS_COMPLETE,
    "sales.return.complete",
    "logistics.manage",
    "sales.create",
    "service_centers.return.complete",
    "service_centers.logistics.manage",
    "service_centers.sales.create",
  ],
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

export function canViewServiceReturnsTab(
  permissions: string[] | undefined,
): boolean {
  return RETURNS_SERVICE_VIEW_PERMISSIONS.some((slug) =>
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
  if (canViewServiceReturnsTab(permissions)) tabs.push("service");
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

/** Reject at pending_cs → evaluate; at pending_tl → approve (plus aliases). */
export function returnsRejectPermissions(status: string): string[] {
  if (status === "pending_cs") {
    return [
      RETURNS_EVALUATE,
      "sales.return.evaluate",
      "service_centers.return.evaluate",
      "sales.create",
      "service_centers.sales.create",
    ];
  }
  if (status === "pending_tl") {
    return [
      RETURNS_APPROVE,
      "sales.return.approve",
      "service_centers.return.approve",
      "orders.approve",
      "service_centers.orders.approve",
    ];
  }
  return [
    RETURNS_EVALUATE,
    RETURNS_APPROVE,
    "sales.return.evaluate",
    "sales.return.approve",
    "service_centers.return.evaluate",
    "service_centers.return.approve",
    "sales.create",
    "service_centers.sales.create",
    "orders.approve",
    "service_centers.orders.approve",
  ];
}
