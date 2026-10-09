import type { LogisticsActionCapabilities } from "@/features/logistics/constants/logistics-permissions";

function uniqueCodes(codes: string[]): string[] {
  return [...new Set(codes)];
}

/** Delivery workflow codes the viewer can Dispatch / Accept (Reject shares those gates). */
export function getDeliveryActionableStatusCodes(
  capabilities: LogisticsActionCapabilities,
): string[] {
  const codes: string[] = [];
  if (capabilities.canManage) codes.push("approved");
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

/** Pull-out workflow codes the viewer can TL-approve, schedule, release, or complete. */
export function getPulloutActionableStatusCodes(
  capabilities: LogisticsActionCapabilities,
): string[] {
  const codes: string[] = [];
  if (capabilities.canApproveTl) codes.push("pending_tl");
  if (capabilities.canSchedulePullout) codes.push("for_pullout");
  if (capabilities.canReleasePullout) codes.push("pending_logistics");
  if (capabilities.canCompletePullout) codes.push("in_transit");
  return uniqueCodes(codes);
}
