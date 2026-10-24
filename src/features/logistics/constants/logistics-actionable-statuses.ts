import type { LogisticsActionCapabilities } from "@/features/logistics/constants/logistics-permissions";

function uniqueCodes(codes: string[]): string[] {
  return [...new Set(codes)];
}

/** Delivery workflow codes the viewer can Dispatch / Accept (Reject shares those gates). */
export function getDeliveryActionableStatusCodes(
  capabilities: LogisticsActionCapabilities,
): string[] {
  const codes: string[] = [];
  if (capabilities.canDispatch) codes.push("approved");
  if (capabilities.canAcceptDelivery) {
    codes.push("pending", "partial");
  }
  return uniqueCodes(codes);
}

/** Transfer workflow codes the viewer can approve, execute, or receive. */
export function getTransferActionableStatusCodes(
  capabilities: LogisticsActionCapabilities,
): string[] {
  const codes: string[] = [];
  if (capabilities.canApproveTl || capabilities.canRejectTransfer) {
    codes.push("requested", "pending_tl");
  }
  if (capabilities.canExecuteTransfer) {
    codes.push("approved", "for_transfer");
  }
  if (capabilities.canReceiveTransfer) {
    codes.push("in_transit");
  }
  return uniqueCodes(codes);
}

/**
 * Pull-out codes the viewer can approve or finish on the logistics list.
 * In transit is not actionable: warehouse receipt is not available.
 */
export function getPulloutActionableStatusCodes(
  capabilities: LogisticsActionCapabilities,
): string[] {
  const codes: string[] = [];
  if (capabilities.canApproveTl) codes.push("pending_tl");
  if (capabilities.canSchedulePullout || capabilities.canManage) {
    codes.push("for_pullout", "pending_logistics");
  }
  return uniqueCodes(codes);
}
