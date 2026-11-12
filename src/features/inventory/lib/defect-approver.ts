import {
  canApproveTransferAt,
  transferApprovalBranchIds,
} from "@/features/logistics/lib/transfer-approver";
import { getUserBranchIds } from "@/lib/aor/scope";

export const NOT_DEFECT_APPROVER_MESSAGE =
  "Only the team leader for this branch can decide this defect report";

/**
 * Branches this person can approve or reject a defect for.
 * `null` means every branch (Super Admin). Same area-of-responsibility rule as transfers.
 */
export async function defectApprovalBranchIds(
  tenantId: string,
  userId: string,
  roleSlugs: string[] | undefined,
): Promise<string[] | null> {
  const assignedBranchIds = await getUserBranchIds(tenantId, userId);
  return transferApprovalBranchIds(roleSlugs, assignedBranchIds);
}

export function assertDefectApprover(
  approvalBranchIds: string[] | null,
  branchId: string,
): void {
  if (!canApproveTransferAt(approvalBranchIds, branchId)) {
    throw new Error(NOT_DEFECT_APPROVER_MESSAGE);
  }
}
