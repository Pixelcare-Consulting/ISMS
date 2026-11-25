/**
 * Branch-scoped approvers (transfers, defect reports). Client-safe: no server imports.
 *
 * A person approves for a branch when they hold the step's checkbox and the branch is in
 * their area of responsibility. `branches.manage` (no branch limit elsewhere either) approves
 * for every branch. No role name decides it.
 */

export const TRANSFER_APPROVE_PERMISSION = "logistics.delivery_transfer.approve";
/** Same checkbox that already lifts the branch limit on orders and inventory. */
export const ALL_BRANCHES_PERMISSION = "branches.manage";

export const NOT_TRANSFER_APPROVER_MESSAGE =
  "Only an approver assigned to the releasing branch can decide this transfer";

/**
 * Branches this person can approve for with `permission`. `null` means every branch.
 * Takes explicit AOR rows: no rows means no branches here, unlike `getUserBranchIds`
 * scope, where no rows means unrestricted.
 */
export function approverBranchIds(
  permissions: readonly string[] | undefined,
  permission: string,
  assignedBranchIds: string[] | null,
): string[] | null {
  if (!permissions?.includes(permission)) return [];
  if (permissions.includes(ALL_BRANCHES_PERMISSION)) return null;
  return assignedBranchIds ?? [];
}

export function transferApprovalBranchIds(
  permissions: readonly string[] | undefined,
  assignedBranchIds: string[] | null,
): string[] | null {
  return approverBranchIds(permissions, TRANSFER_APPROVE_PERMISSION, assignedBranchIds);
}

export function canApproveTransferAt(approvalBranchIds: string[] | null, fromBranchId: string): boolean {
  return approvalBranchIds === null || approvalBranchIds.includes(fromBranchId);
}
