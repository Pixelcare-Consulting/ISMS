// Pure constants (no server imports) so client navigation can use them too.
export const BRANCH_QUOTA_VIEW = "branch_quotas.view";
export const BRANCH_QUOTA_MANAGE = "branch_quotas.manage";

/** Either permission opens the Branch quotas page. */
export const BRANCH_QUOTA_ACCESS = [BRANCH_QUOTA_VIEW, BRANCH_QUOTA_MANAGE];

export function canManageBranchQuotas(permissions: string[] | undefined): boolean {
  return permissions?.includes(BRANCH_QUOTA_MANAGE) ?? false;
}
