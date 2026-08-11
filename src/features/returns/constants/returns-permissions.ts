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
 */

export const RETURNS_VIEW = "returns.view";
export const RETURNS_REQUEST = "returns.request";
export const RETURNS_EVALUATE = "returns.evaluate";
export const RETURNS_APPROVE = "returns.approve";
export const RETURNS_COMPLETE = "returns.complete";

/** Any of these grants Returns nav + `/returns` page access. */
export const RETURNS_ACCESS_PERMISSIONS = [
  RETURNS_VIEW,
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

export const RETURNS_ACTION_CAPABILITIES = {
  canViewReturns: [
    RETURNS_VIEW,
    "sales.return.view",
    "service_centers.return.request",
    "service_centers.return.evaluate",
    "service_centers.return.approve",
    "service_centers.return.complete",
  ],
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
