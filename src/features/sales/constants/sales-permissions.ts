import {
  resolveCapabilities,
  type ResolvedCapabilities,
} from "@/lib/auth/action-capabilities";
import { hasPermission } from "@/lib/auth/permissions";

/**
 * Sales action-button permissions (encode + list).
 * Return workflow capabilities stay here so Sale details can still request/process
 * while also accepting new `returns.*` aliases.
 *
 * Recipe: see `src/lib/auth/action-capabilities.ts`.
 */

export const SALES_VIEW = "sales.view";
export const SALES_CREATE = "sales.create";
/** Edit sale transaction header fields (Accounting / admins). */
export const SALES_UPDATE = "sales.update";
export const SALES_RETURN_VIEW = "sales.return.view";
export const SALES_RETURN_REQUEST = "sales.return.request";
export const SALES_RETURN_EVALUATE = "sales.return.evaluate";
export const SALES_RETURN_APPROVE = "sales.return.approve";
export const SALES_RETURN_COMPLETE = "sales.return.complete";

/** Sales tab list access (sale lines). */
export const SALES_LIST_PERMISSIONS = [
  SALES_VIEW,
  SALES_CREATE,
  SALES_UPDATE,
] as const;

/** Lookups / proof upload shared by encode and header edit. */
export const SALES_LOOKUP_PERMISSIONS = [SALES_CREATE, SALES_UPDATE] as const;

/** Any of these grants Sales nav + `/sales` page access. */
export const SALES_ACCESS_PERMISSIONS = [
  SALES_VIEW,
  SALES_CREATE,
  SALES_UPDATE,
] as const;

/**
 * Capability map for Sales page CTA + return buttons on sale details.
 * Includes `returns.*` aliases so roles granted the new module still work on details.
 */
export const SALES_ACTION_CAPABILITIES = {
  canViewSalesList: [SALES_VIEW, SALES_CREATE, SALES_UPDATE],
  canViewReturns: [
    "returns.view",
    SALES_RETURN_VIEW,
    "service_centers.return.request",
    "service_centers.return.evaluate",
    "service_centers.return.approve",
    "service_centers.return.complete",
  ],
  canCreateSale: SALES_CREATE,
  canUpdateSaleHeader: SALES_UPDATE,
  canRequestReturn: [
    "returns.request",
    SALES_RETURN_REQUEST,
    SALES_CREATE,
  ],
  canEvaluateReturn: ["returns.evaluate", SALES_RETURN_EVALUATE],
  canApproveReturn: [
    "returns.approve",
    SALES_RETURN_APPROVE,
    "orders.approve",
  ],
  canCompleteReturn: [
    "returns.complete",
    SALES_RETURN_COMPLETE,
    "logistics.manage",
    SALES_CREATE,
  ],
} as const;

export type SalesActionCapabilities = ResolvedCapabilities<
  typeof SALES_ACTION_CAPABILITIES
>;

export function resolveSalesCapabilities(
  permissions: string[] | undefined,
): SalesActionCapabilities {
  return resolveCapabilities(permissions, SALES_ACTION_CAPABILITIES);
}

export function canAccessSales(permissions: string[] | undefined): boolean {
  return SALES_ACCESS_PERMISSIONS.some((slug) => hasPermission(permissions, slug));
}

/** Reject at pending_cs → evaluate; at pending_tl → approve (plus aliases). */
export function salesReturnRejectPermissions(status: string): string[] {
  if (status === "pending_cs") {
    return ["returns.evaluate", SALES_RETURN_EVALUATE, SALES_CREATE];
  }
  if (status === "pending_tl") {
    return ["returns.approve", SALES_RETURN_APPROVE, "orders.approve"];
  }
  return [
    "returns.evaluate",
    "returns.approve",
    SALES_RETURN_EVALUATE,
    SALES_RETURN_APPROVE,
    SALES_CREATE,
    "orders.approve",
  ];
}
