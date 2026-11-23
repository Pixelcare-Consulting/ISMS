import { hasProviderRole } from "@/features/roles/constants/role.constants";

/** Home for a customer-tenant Super Admin. */
export const SETUP_HOME = "/setup";

/**
 * Permissions a customer-tenant Super Admin may hold.
 * Orders, logistics, inventory, sales, returns, reports, and competitor
 * permissions stay with the teams that run them.
 * Overview, P-Count Dashboard, and Market Survey open by role, not by
 * inventory.view, reports.view, or competitors.view.
 * Oversight covers audit logs, policies, SAP integration, and planning.
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
  "branch_quotas.view",
  "branch_quotas.manage",
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
  "audit_logs.view",
  "serial_logs.view",
  "inventory_approvals.view",
  "policies.view",
  "policies.create",
  "policies.approve",
  "sap.manage",
  "forecast.manage",
] as const;

/**
 * Exact paths only.
 * `/dashboard` is Overview. Treating it as a prefix would also open
 * Operations, Sales, and every other board under `/dashboard/...`.
 */
const SETUP_ALLOWED_EXACT_PATHS: ReadonlySet<string> = new Set(["/dashboard"]);

/**
 * App paths a tenant setup admin may open.
 * Each entry allows that path and its descendants, including policy documents
 * and planning runs.
 * P-Count and Market Survey are listed on their own.
 * Operations, Sales, and every other `/dashboard/...` route stay omitted.
 */
const SETUP_ALLOWED_PATH_PREFIXES = [
  SETUP_HOME,
  "/dashboard/custom",
  "/dashboard/pcount",
  "/dashboard/site-traffic",
  "/competitors",
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
  "/settings/planning",
  "/settings/master-data",
  "/settings/sap-integration",
  "/audit-logs/system",
  "/audit-logs/serial-numbers",
  "/audit-logs/inventory-approvals",
  "/policies",
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
  if (SETUP_ALLOWED_EXACT_PATHS.has(pathname)) {
    return true;
  }
  return SETUP_ALLOWED_PATH_PREFIXES.some((prefix) =>
    isPathOrDescendant(pathname, prefix),
  );
}
