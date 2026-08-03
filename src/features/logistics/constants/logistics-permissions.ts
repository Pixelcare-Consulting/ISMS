import {
  resolveCapabilities,
  type ResolvedCapabilities,
} from "@/lib/auth/action-capabilities";
import { hasPermission } from "@/lib/auth/permissions";

/**
 * Logistics action-button permissions.
 *
 * Recipe: see `src/lib/auth/action-capabilities.ts`.
 * Admins toggle these in Settings → Roles after seed.
 */

export const LOGISTICS_VIEW = "logistics.view";
export const LOGISTICS_CREATE = "logistics.create";
export const LOGISTICS_MANAGE = "logistics.manage";

/** Any of these grants Logistics nav + list access. */
export const LOGISTICS_ACCESS_PERMISSIONS = [
  LOGISTICS_VIEW,
  LOGISTICS_CREATE,
  LOGISTICS_MANAGE,
] as const;

/**
 * Legacy order slugs kept for one release so PS/TL who only have orders.*
 * can still open deliveries / transfers / pull-outs.
 */
export const LOGISTICS_READ_ALIASES = [
  "orders.create",
  "orders.view",
] as const;

/** Page / list / KPI gate: logistics.* or legacy order aliases. */
export const LOGISTICS_PAGE_PERMISSIONS = [
  ...LOGISTICS_ACCESS_PERMISSIONS,
  ...LOGISTICS_READ_ALIASES,
] as const;

/**
 * Capability map for logistics write paths.
 * Short alias lists keep pre-reseed tenants working for one release.
 */
export const LOGISTICS_ACTION_CAPABILITIES = {
  canCreate: [LOGISTICS_CREATE, LOGISTICS_MANAGE, "orders.create"],
  canManage: LOGISTICS_MANAGE,
  canAcceptDelivery: [LOGISTICS_CREATE, LOGISTICS_MANAGE, "orders.create"],
  canExecuteTransfer: LOGISTICS_MANAGE,
  canSchedulePullout: LOGISTICS_MANAGE,
  canCompletePullout: LOGISTICS_MANAGE,
} as const;

export type LogisticsActionCapabilities = ResolvedCapabilities<
  typeof LOGISTICS_ACTION_CAPABILITIES
>;

export function resolveLogisticsCapabilities(
  permissions: string[] | undefined,
): LogisticsActionCapabilities {
  return resolveCapabilities(permissions, LOGISTICS_ACTION_CAPABILITIES);
}

export function canAccessLogistics(permissions: string[] | undefined): boolean {
  return LOGISTICS_PAGE_PERMISSIONS.some((slug) =>
    hasPermission(permissions, slug),
  );
}
