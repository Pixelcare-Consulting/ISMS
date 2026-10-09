import type { ReturnRequestStatus } from "@prisma/client";

import type { ReturnsActionCapabilities } from "@/features/returns/constants/returns-permissions";

/**
 * Approvals-queue statuses the viewer can Evaluate / Approve / Complete.
 * Matches button gates on the Returns Approvals tab.
 */
export function getReturnsActionableApprovalStatuses(
  capabilities: Pick<
    ReturnsActionCapabilities,
    "canEvaluateReturn" | "canApproveReturn" | "canCompleteReturn"
  >,
): ReturnRequestStatus[] {
  const statuses: ReturnRequestStatus[] = [];
  if (capabilities.canEvaluateReturn) statuses.push("pending_cs");
  if (capabilities.canApproveReturn) statuses.push("pending_tl");
  if (capabilities.canCompleteReturn) statuses.push("approved");
  return statuses;
}
