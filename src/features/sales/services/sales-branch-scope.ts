import { getUserBranchIds } from "@/lib/aor/scope";
import { hasPermission } from "@/lib/auth/permissions";

/** Roles that work every branch's sales (same rule as sale encode and header edit). */
export function hasSalesFullBranchAccess(permissions: string[] | undefined): boolean {
  return (
    hasPermission(permissions, "branches.manage") ||
    hasPermission(permissions, "master_data.manage")
  );
}

/**
 * Sold-branch ("Branch Sold") scope for the Sales list and the Branch Returns tab.
 * `null` = every branch. Users with AOR rows see only those branches; a user with
 * no AOR rows stays unrestricted, the same rule Orders and Logistics use.
 */
export async function resolveSoldBranchScope(
  tenantId: string,
  userId: string,
  permissions: string[] | undefined,
): Promise<string[] | null> {
  if (hasSalesFullBranchAccess(permissions)) return null;
  return getUserBranchIds(tenantId, userId);
}
