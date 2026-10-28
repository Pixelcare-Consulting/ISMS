import { hasPermission } from "@/lib/auth/permissions";
import { resolveLogisticsCapabilities } from "@/features/logistics/constants/logistics-permissions";

/**
 * Server-side gates for transfer and pull-out posting.
 * Capability slugs stay the logistics map. Branch scope matches orders:
 * branches.manage or no area-of-responsibility rows means unrestricted.
 */

export type LogisticsPostingAction =
  | "transfer.create"
  | "transfer.approve"
  | "transfer.reject"
  | "transfer.release"
  | "transfer.saveShipment"
  | "transfer.receive"
  | "pullout.create"
  | "pullout.approve"
  | "pullout.reject"
  | "pullout.updateList"
  | "pullout.finalize"
  | "pullout.complete";

const DENIED = "You do not have permission for this logistics action";

export function postingPermissionError(
  permissions: string[] | undefined,
  action: LogisticsPostingAction,
): string | null {
  const caps = resolveLogisticsCapabilities(permissions);
  switch (action) {
    case "transfer.create":
    case "pullout.create":
      return caps.canCreate ? null : DENIED;
    case "transfer.approve":
    case "pullout.approve":
      return caps.canApproveTl ? null : DENIED;
    case "transfer.reject":
    case "pullout.reject":
      return caps.canRejectTransfer ? null : DENIED;
    case "transfer.release":
    case "transfer.saveShipment":
    case "pullout.updateList":
    case "pullout.finalize":
      return caps.canManage ? null : DENIED;
    case "transfer.receive":
      return caps.canReceiveTransfer ? null : DENIED;
    case "pullout.complete":
      return caps.canCompletePullout ? null : DENIED;
    default: {
      const unreachable: never = action;
      return unreachable;
    }
  }
}

/** `null` scope is unrestricted. An empty list matches no branch. */
export function branchScopeError(
  scope: string[] | null,
  branchId: string,
): string | null {
  if (scope === null) return null;
  if (scope.includes(branchId)) return null;
  return "This branch is outside your area of responsibility";
}

export function isBranchScopeUnrestricted(permissions: string[] | undefined): boolean {
  return hasPermission(permissions, "branches.manage");
}
