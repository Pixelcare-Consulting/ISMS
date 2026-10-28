import type { Prisma } from "@/lib/database/generated/prisma/client";

import type { LogisticsActionCapabilities } from "@/features/logistics/constants/logistics-permissions";
import { TRANSFER_WORKFLOW_CODE } from "@/features/logistics/constants/workflow-codes";
import { isBranchScopeUnrestricted } from "@/features/logistics/services/logistics-posting-access";
import { getUserBranchIds } from "@/lib/aor/scope";

const APPROVAL_CODES = [
  TRANSFER_WORKFLOW_CODE.pending_tl,
  TRANSFER_WORKFLOW_CODE.requested,
] as const;

const RELEASE_CODES = [
  TRANSFER_WORKFLOW_CODE.approved,
  TRANSFER_WORKFLOW_CODE.for_transfer,
] as const;

const RECEIVE_CODES = [
  TRANSFER_WORKFLOW_CODE.approved,
  TRANSFER_WORKFLOW_CODE.for_transfer,
  TRANSFER_WORKFLOW_CODE.in_transit,
] as const;

export interface TransferVisibility {
  fromBranchId: string;
  toBranchId: string;
  statusCode: string;
}

/** `null` matches every branch (no area of responsibility, or branches.manage). */
export async function resolveLogisticsBranchScope(actor: {
  tenantId: string;
  userId: string;
  permissions?: string[];
}): Promise<string[] | null> {
  if (isBranchScopeUnrestricted(actor.permissions)) return null;
  return getUserBranchIds(actor.tenantId, actor.userId);
}

export function transferIsVisible(scope: string[] | null, transfer: TransferVisibility): boolean {
  if (scope === null) return true;
  if (scope.includes(transfer.fromBranchId)) return true;
  if (isApprovalStatus(transfer.statusCode)) return false;
  return scope.includes(transfer.toBranchId);
}

/**
 * Releasing-branch staff see the request at every step.
 * Receiving-branch staff see it only after the releasing team leader has approved.
 */
export function transferListWhere(scope: string[] | null): Prisma.BranchTransferWhereInput {
  if (scope === null) return {};
  if (scope.length === 0) return { id: { in: [] } };
  return {
    OR: [
      { fromBranchId: { in: scope } },
      {
        toBranchId: { in: scope },
        statusCode: { code: { notIn: [...APPROVAL_CODES] } },
      },
    ],
  };
}

/**
 * Sidebar count of transfers waiting on this person.
 * Approval is only the releasing branch. Accept or reject is only the receiving branch.
 */
export function transferActionableWhere(
  scope: string[] | null,
  capabilities: Pick<
    LogisticsActionCapabilities,
    "canApproveTl" | "canRejectTransfer" | "canExecuteTransfer" | "canReceiveTransfer"
  >,
): Prisma.BranchTransferWhereInput | null {
  if (scope !== null && scope.length === 0) return { id: { in: [] } };
  const fromBranch = scope === null ? {} : { fromBranchId: { in: scope } };
  const toBranch = scope === null ? {} : { toBranchId: { in: scope } };
  const parts: Prisma.BranchTransferWhereInput[] = [];
  if (capabilities.canApproveTl || capabilities.canRejectTransfer) {
    parts.push({
      ...fromBranch,
      statusCode: { code: { in: [...APPROVAL_CODES] } },
    });
  }
  if (capabilities.canExecuteTransfer) {
    parts.push({
      ...fromBranch,
      statusCode: { code: { in: [...RELEASE_CODES] } },
    });
  }
  if (capabilities.canReceiveTransfer || capabilities.canApproveTl) {
    parts.push({
      ...toBranch,
      statusCode: { code: { in: [...RECEIVE_CODES] } },
    });
  }
  if (parts.length === 0) return null;
  return { OR: parts };
}

function isApprovalStatus(code: string): boolean {
  switch (code) {
    case TRANSFER_WORKFLOW_CODE.pending_tl:
    case TRANSFER_WORKFLOW_CODE.requested:
      return true;
    default:
      return false;
  }
}
