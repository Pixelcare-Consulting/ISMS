import {
  resolveCapabilities,
  type ResolvedCapabilities,
} from "@/lib/auth/action-capabilities";
import { hasPermission } from "@/lib/auth/permissions";
import { RETURNS_ACTION_CAPABILITIES } from "@/features/returns/constants/returns-permissions";

/**
 * Sales action-button permissions (encode + list).
 * Return buttons on Sale details use the Returns checkboxes, the same as the Returns page.
 *
 * Recipe: see `src/lib/auth/action-capabilities.ts`.
 */

export const SALES_VIEW = "sales.view";
export const SALES_CREATE = "sales.create";
/** Edit sale transaction header fields (Accounting / admins). */
export const SALES_UPDATE = "sales.update";

/** Sales tab list access (sale lines). */
export const SALES_LIST_PERMISSIONS = [
  SALES_VIEW,
  SALES_CREATE,
  SALES_UPDATE,
] as const;

/** Lookups / proof upload shared by encode and header edit. */
export const SALES_LOOKUP_PERMISSIONS = [SALES_CREATE, SALES_UPDATE] as const;

/**
 * Master-data lookups, model price, and proof upload. Service center sales use the same
 * encode form, so their encode/edit permissions open these too. Branch pickers stay on
 * SALES_LOOKUP_PERMISSIONS.
 */
export const SALE_MASTER_LOOKUP_PERMISSIONS = [
  ...SALES_LOOKUP_PERMISSIONS,
  "service_centers.sales.create",
  "service_centers.sales.update",
] as const;

/** Encode a sale line (model price): branch or service center sales. */
export const SALE_ENCODE_PERMISSIONS = [
  SALES_CREATE,
  "service_centers.sales.create",
] as const;

/** Any of these grants Sales nav + `/sales` page access. */
export const SALES_ACCESS_PERMISSIONS = [
  SALES_VIEW,
  SALES_CREATE,
  SALES_UPDATE,
] as const;

/** Capability map for Sales page CTA + return buttons on sale details. */
export const SALES_ACTION_CAPABILITIES = {
  canViewSalesList: [SALES_VIEW, SALES_CREATE, SALES_UPDATE],
  canViewReturns: RETURNS_ACTION_CAPABILITIES.canViewReturns,
  canCreateSale: SALES_CREATE,
  canUpdateSaleHeader: SALES_UPDATE,
  canRequestReturn: RETURNS_ACTION_CAPABILITIES.canRequestReturn,
  canEvaluateReturn: RETURNS_ACTION_CAPABILITIES.canEvaluateReturn,
  canApproveReturn: RETURNS_ACTION_CAPABILITIES.canApproveReturn,
  canCompleteReturn: RETURNS_ACTION_CAPABILITIES.canCompleteReturn,
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
