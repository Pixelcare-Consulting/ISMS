import { hasDashboardFullAccess } from "@/features/dashboard/constants/dashboard-permissions";
import { getUserBranchIds } from "@/lib/aor/scope";

export interface ReportViewer {
  tenantId: string;
  userId: string;
  permissions: string[];
}

/**
 * What a viewer with no branch AOR sees. Order-based reports have always
 * returned nothing; the inventory report has always returned every branch.
 */
export type UnassignedBranchRule = "NO_BRANCHES" | "ALL_BRANCHES";

/** `undefined` = no branch restriction; an array = only these branches (empty = none). */
export type ReportBranchScope = string[] | undefined;

/**
 * Branch scope for reports and report-backed dashboards, in priority order:
 * 1. Role/permission: approvers and `branches.manage` holders see every branch
 *    (same rule as the Operations/Sales dashboards).
 * 2. AOR: everyone else sees their assigned branches.
 * 3. No AOR: falls back to the report's `unassigned` rule.
 */
export async function resolveReportBranchScope(
  viewer: ReportViewer,
  unassigned: UnassignedBranchRule,
): Promise<ReportBranchScope> {
  if (hasDashboardFullAccess(viewer.permissions)) return undefined;
  const aorBranchIds = await getUserBranchIds(viewer.tenantId, viewer.userId);
  if (aorBranchIds && aorBranchIds.length > 0) return aorBranchIds;
  return unassigned === "ALL_BRANCHES" ? undefined : [];
}

/** Narrows a scope to one requested branch; `null` when that branch is outside it. */
export function narrowBranchScope(scope: ReportBranchScope, branchId: string | undefined): ReportBranchScope | null {
  if (!branchId) return scope;
  if (scope !== undefined && !scope.includes(branchId)) return null;
  return [branchId];
}
