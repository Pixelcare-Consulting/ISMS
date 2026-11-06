import {
  isSuperAdminOrderOverride,
  TEAM_LEADER_ROLE_SLUG,
} from "@/features/orders/constants/order-workflow";

export const NOT_TRANSFER_APPROVER_MESSAGE =
  "Only the team leader assigned to the releasing branch can decide this transfer";

/**
 * Branches this person can approve or reject transfers for. `null` means every branch.
 * Takes explicit AOR rows: no rows means no branches here, unlike `getUserBranchIds`
 * scope, where no rows means unrestricted.
 */
export function transferApprovalBranchIds(
  roleSlugs: string[] | undefined,
  assignedBranchIds: string[] | null,
): string[] | null {
  if (isSuperAdminOrderOverride(roleSlugs ?? [])) return null;
  if (!roleSlugs?.includes(TEAM_LEADER_ROLE_SLUG)) return [];
  return assignedBranchIds ?? [];
}

export function canApproveTransferAt(approvalBranchIds: string[] | null, fromBranchId: string): boolean {
  return approvalBranchIds === null || approvalBranchIds.includes(fromBranchId);
}
