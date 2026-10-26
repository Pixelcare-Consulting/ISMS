import type { LogisticsActionCapabilities } from "@/features/logistics/constants/logistics-permissions";
import {
  DELIVERY_WORKFLOW_CODE,
  PULLOUT_WORKFLOW_CODE,
  TRANSFER_WORKFLOW_CODE,
} from "@/features/logistics/constants/workflow-codes";

function uniqueCodes(codes: string[]): string[] {
  return [...new Set(codes)];
}

/** Delivery workflow codes the viewer can Dispatch / Accept (Reject shares those gates). */
export function getDeliveryActionableStatusCodes(
  capabilities: LogisticsActionCapabilities,
): string[] {
  const codes: string[] = [];
  if (capabilities.canDispatch) codes.push(DELIVERY_WORKFLOW_CODE.approved);
  if (capabilities.canAcceptDelivery) {
    codes.push(DELIVERY_WORKFLOW_CODE.pending, DELIVERY_WORKFLOW_CODE.partial);
  }
  return uniqueCodes(codes);
}

/** Transfer workflow codes the viewer can approve, execute, or receive. */
export function getTransferActionableStatusCodes(
  capabilities: LogisticsActionCapabilities,
): string[] {
  const codes: string[] = [];
  if (capabilities.canApproveTl || capabilities.canRejectTransfer) {
    codes.push(TRANSFER_WORKFLOW_CODE.requested, TRANSFER_WORKFLOW_CODE.pending_tl);
  }
  if (capabilities.canExecuteTransfer) {
    codes.push(TRANSFER_WORKFLOW_CODE.approved, TRANSFER_WORKFLOW_CODE.for_transfer);
  }
  if (capabilities.canReceiveTransfer) {
    codes.push(TRANSFER_WORKFLOW_CODE.in_transit);
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
  if (capabilities.canApproveTl) codes.push(PULLOUT_WORKFLOW_CODE.pending_tl);
  if (capabilities.canSchedulePullout || capabilities.canManage) {
    codes.push(PULLOUT_WORKFLOW_CODE.for_pullout, PULLOUT_WORKFLOW_CODE.pending_logistics);
  }
  return uniqueCodes(codes);
}
