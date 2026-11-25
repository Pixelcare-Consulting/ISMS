import { hasPermission } from "@/lib/auth/permissions";
import {
  resolveLogisticsCapabilities,
  resolvePulloutCapabilities,
} from "@/features/logistics/constants/logistics-permissions";

/**
 * Server-side gates for transfer and pull-out posting.
 * Transfers and pull-outs keep separate checks so a pull-out checkbox does not
 * post a transfer. Branch scope matches orders: branches.manage or no
 * area-of-responsibility rows means unrestricted.
 */

export type LogisticsPostingAction =
  | "transfer.create"
  | "transfer.approve"
  | "transfer.reject"
  | "transfer.release"
  | "transfer.receive"
  | "pullout.create"
  | "pullout.approve"
  | "pullout.reject"
  | "pullout.updateList"
  | "pullout.finalize"
  | "pullout.checkSap"
  | "pullout.cancel"
  | "pullout.complete";

const DENIED = "You do not have permission for this logistics action";

export function postingPermissionError(
  permissions: string[] | undefined,
  action: LogisticsPostingAction,
): string | null {
  const transfers = resolveLogisticsCapabilities(permissions);
  const pullouts = resolvePulloutCapabilities(permissions);
  switch (action) {
    case "transfer.create":
      return transfers.canCreate ? null : DENIED;
    case "pullout.create":
      return pullouts.canCreate ? null : DENIED;
    case "transfer.approve":
      return transfers.canApproveTl ? null : DENIED;
    case "pullout.approve":
      return pullouts.canApproveTl ? null : DENIED;
    case "transfer.reject":
      return transfers.canRejectTransfer ? null : DENIED;
    case "pullout.reject":
      return pullouts.canRejectTransfer ? null : DENIED;
    case "transfer.release":
      return transfers.canManage ? null : DENIED;
    case "pullout.updateList":
    case "pullout.finalize":
    case "pullout.checkSap":
    case "pullout.cancel":
    case "pullout.complete":
      return pullouts.canManage ? null : DENIED;
    case "transfer.receive":
      return transfers.canReceiveTransfer ? null : DENIED;
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
