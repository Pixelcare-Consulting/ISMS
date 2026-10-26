import type { DeliveryTransferStatus } from "@prisma/client";

import {
  DELIVERY_TRANSFER_STATUS_COLORS,
  DELIVERY_TRANSFER_STATUS_LABELS,
} from "@/features/logistics/constants/delivery-workflow-labels";

/**
 * Lookup keys the delivery, transfer, and pull-out flows write.
 * Names, colors, and order come from Organization → Status settings.
 * Pull-out reasons (GOOD, DEF, OVR, …) are a different catalog.
 */
export const DELIVERY_WORKFLOW_CODE = {
  requested: "requested",
  approved: "approved",
  pending: "pending",
  accepted: "accepted",
  rejected: "rejected",
  partial: "partial",
} as const;

export type DeliveryWorkflowCodeKey =
  (typeof DELIVERY_WORKFLOW_CODE)[keyof typeof DELIVERY_WORKFLOW_CODE];

export const TRANSFER_WORKFLOW_CODE = {
  requested: "requested",
  approved: "approved",
  draft: "draft",
  pending_tl: "pending_tl",
  for_transfer: "for_transfer",
  in_transit: "in_transit",
  accepted: "accepted",
  rejected: "rejected",
  completed: "completed",
  cancelled: "cancelled",
} as const;

export type TransferWorkflowCodeKey =
  (typeof TRANSFER_WORKFLOW_CODE)[keyof typeof TRANSFER_WORKFLOW_CODE];

export const PULLOUT_WORKFLOW_CODE = {
  requested: "requested",
  approved: "approved",
  draft: "draft",
  pending_tl: "pending_tl",
  for_pullout: "for_pullout",
  scheduled: "scheduled",
  pending_logistics: "pending_logistics",
  in_transit: "in_transit",
  pulled_out: "pulled_out",
  completed: "completed",
  cancelled: "cancelled",
} as const;

export type PulloutWorkflowCodeKey =
  (typeof PULLOUT_WORKFLOW_CODE)[keyof typeof PULLOUT_WORKFLOW_CODE];

/** Outcomes that stop progress. The label still comes from Status settings. */
export const DELIVERY_STOP_CODES = [DELIVERY_WORKFLOW_CODE.rejected] as const;
export const TRANSFER_STOP_CODES = [
  TRANSFER_WORKFLOW_CODE.rejected,
  TRANSFER_WORKFLOW_CODE.cancelled,
] as const;
export const PULLOUT_STOP_CODES = [PULLOUT_WORKFLOW_CODE.cancelled] as const;

/** Reaching one of these finishes that step. */
export const DELIVERY_SETTLED_CODES = [DELIVERY_WORKFLOW_CODE.accepted] as const;
export const TRANSFER_SETTLED_CODES = [
  TRANSFER_WORKFLOW_CODE.accepted,
  TRANSFER_WORKFLOW_CODE.completed,
] as const;
export const PULLOUT_SETTLED_CODES = [
  PULLOUT_WORKFLOW_CODE.pulled_out,
  PULLOUT_WORKFLOW_CODE.completed,
] as const;

export interface WorkflowStatusOption {
  code: string;
  name: string;
  color: string | null;
  sortOrder: number;
}

export function toWorkflowStatusOptions(
  rows: readonly {
    code: string;
    name: string;
    color?: string | null;
    sortOrder: number;
  }[],
): WorkflowStatusOption[] {
  return rows.map((row) => ({
    code: row.code,
    name: row.name,
    color: row.color ?? null,
    sortOrder: row.sortOrder,
  }));
}

export function workflowStatusLabel(status: { code: string; name: string }): string {
  const name = status.name.trim();
  return name || status.code;
}

export function workflowStatusByCode(
  catalog: readonly WorkflowStatusOption[],
  code: string,
): WorkflowStatusOption | null {
  const key = code.trim().toLowerCase();
  return catalog.find((row) => row.code.trim().toLowerCase() === key) ?? null;
}

/** Exact key match. Custom codes that are not one of these keys stay unmatched. */
export function asWorkflowCode<T extends Record<string, string>>(
  codes: T,
  code: string,
): T[keyof T] | null {
  for (const value of Object.values(codes) as T[keyof T][]) {
    if (value === code) return value;
  }
  return null;
}

/**
 * Unit-transfer rows store a fixed document state. In transit, completed, and
 * cancelled share the Transfer workflow code, so their name and color follow
 * Status settings. Pending approval has no workflow code.
 */
export function unitTransferWorkflowCode(
  status: DeliveryTransferStatus,
): TransferWorkflowCodeKey | null {
  switch (status) {
    case "IN_TRANSIT":
      return TRANSFER_WORKFLOW_CODE.in_transit;
    case "COMPLETED":
      return TRANSFER_WORKFLOW_CODE.completed;
    case "CANCELLED":
      return TRANSFER_WORKFLOW_CODE.cancelled;
    case "PENDING_APPROVAL":
      return null;
    default: {
      const unreachable: never = status;
      return unreachable;
    }
  }
}

export function unitTransferStatusPresentation(
  status: DeliveryTransferStatus,
  catalog: readonly WorkflowStatusOption[],
): { code: string; name: string; color: string | null } {
  const workflowCode = unitTransferWorkflowCode(status);
  const match = workflowCode ? workflowStatusByCode(catalog, workflowCode) : null;
  if (match) {
    return { code: match.code, name: workflowStatusLabel(match), color: match.color };
  }
  return {
    code: status,
    name: DELIVERY_TRANSFER_STATUS_LABELS[status],
    color: DELIVERY_TRANSFER_STATUS_COLORS[status],
  };
}
