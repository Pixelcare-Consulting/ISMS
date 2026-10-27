import { hasProviderRole } from "@/features/roles/constants/role.constants";

/** Home for a customer-tenant Super Admin. */
export const SETUP_HOME = "/setup";

/**
 * Permissions a customer-tenant Super Admin may hold.
 * Orders, logistics, inventory, sales, returns, reports, live dashboards,
 * forecast, and SAP jobs stay with the teams that run them.
 * Custom dashboard setup is included. Site traffic reuses users.manage.
 */
export const SETUP_PERMISSION_SLUGS = [
  "company.view",
  "company.manage",
  "departments.manage",
  "status_settings.manage",
  "users.manage",
  "roles.manage",
  "aors.view",
  "aors.manage",
  "branches.view",
  "branches.manage",
  "warehouses.manage",
  "service_centers.manage",
  "dealers.manage",
  "ordering_settings.view",
  "ordering_settings.manage",
  "planogram.view",
  "planogram.manage",
  "master_data.manage",
  "dashboard.custom.view",
  "dashboard.custom.manage",
] as const;

/**
 * App paths a tenant setup admin may open.
 * Each entry allows that path and its descendants.
 * Live dashboard boards, planning runs, and the SAP job list are omitted.
 */
const SETUP_ALLOWED_PATH_PREFIXES = [
  SETUP_HOME,
  "/dashboard/custom",
  "/dashboard/site-traffic",
  "/help",
  "/settings/profile",
  "/settings/company",
  "/settings/departments",
  "/settings/status",
  "/settings/users",
  "/settings/roles",
  "/settings/permissions",
  "/settings/aors",
  "/settings/branches",
  "/settings/warehouses",
  "/settings/service-centers",
  "/settings/dealers",
  "/settings/branch-quotas",
  "/settings/ordering",
  "/settings/planogram",
  "/settings/master-data",
] as const;

export function isTenantSetupAdmin({
  roleSlugs,
  isPlatformOperator,
}: {
  roleSlugs: string[] | undefined;
  isPlatformOperator: boolean;
}): boolean {
  return hasProviderRole(roleSlugs) && !isPlatformOperator;
}

function isPathOrDescendant(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** True when a tenant setup admin may open this app path. */
export function isSetupPathAllowed(pathname: string): boolean {
  return SETUP_ALLOWED_PATH_PREFIXES.some((prefix) =>
    isPathOrDescendant(pathname, prefix),
  );
}
