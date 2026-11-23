import { userHasProviderOnlyRole } from "@/features/roles/constants/role.constants";

type RoleLink = { role: { slug: string } };

/** Why Reset session must stay closed, or null when it is allowed. */
export function resetSessionDeniedReason(input: {
  actorUserId: string;
  targetUserId: string;
  targetRoles: RoleLink[];
}): string | null {
  if (
    input.actorUserId === input.targetUserId &&
    !userHasProviderOnlyRole(input.targetRoles)
  ) {
    return "You cannot reset your own session";
  }
  return null;
}

/** Why Disable account must stay closed, or null when it is allowed. */
export function disableAccountDeniedReason(input: {
  actorUserId: string;
  targetUserId: string;
  targetRoles: RoleLink[];
}): string | null {
  if (userHasProviderOnlyRole(input.targetRoles)) {
    return "This user cannot be disabled";
  }
  if (input.actorUserId === input.targetUserId) {
    return "You cannot disable your own account";
  }
  return null;
}

export function resetSessionConfirmDescription(name: string): string {
  return `Sign ${name} out of every device so they can sign in again? Any unsaved work on their open session is lost.`;
}
