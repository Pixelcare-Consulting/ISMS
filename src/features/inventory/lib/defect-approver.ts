import {
  approverBranchIds,
  canApproveTransferAt,
} from "@/features/logistics/lib/transfer-approver";
import { getUserBranchIds } from "@/lib/aor/scope";

export const DEFECT_APPROVE_PERMISSION = "inventory.defect.approve";

export const NOT_DEFECT_APPROVER_MESSAGE =
  "Only an approver assigned to this branch can decide this defect report";

/**
 * Branches this person can approve or reject a defect for. `null` means every branch.
 * Same area-of-responsibility rule as transfers, on the "Approve defect reports" checkbox.
 */
export async function defectApprovalBranchIds(
  tenantId: string,
  userId: string,
  permissions: readonly string[] | undefined,
): Promise<string[] | null> {
  if (!permissions?.includes(DEFECT_APPROVE_PERMISSION)) return [];
  const assignedBranchIds = await getUserBranchIds(tenantId, userId);
  return approverBranchIds(permissions, DEFECT_APPROVE_PERMISSION, assignedBranchIds);
}

export function assertDefectApprover(
  approvalBranchIds: string[] | null,
  branchId: string,
): void {
  if (!canApproveTransferAt(approvalBranchIds, branchId)) {
    throw new Error(NOT_DEFECT_APPROVER_MESSAGE);
  }
}
