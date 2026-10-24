import type { BranchOrderStatus, BranchOrderType } from "@prisma/client";

import { BRANCH_ORDER_STATUS_LABELS } from "@/features/orders/constants/order-status";
import {
  getInitialOrderStatus,
  getOrderApprovalChain,
} from "@/features/orders/constants/order-workflow";

/**
 * Approval progress for one order. Steps are only the statuses that order
 * type's chain writes, then Approved. A rejection or cancellation does not
 * complete anything after the last step the record proves.
 */

export type OrderTrackerState = "completed" | "current" | "upcoming" | "cancelled" | "rejected";

export interface OrderTrackerApproval {
  level: number;
  approvedAt: string | null;
  rejectedAt: string | null;
}

export interface OrderHistoryTrackerInput {
  orderType: BranchOrderType;
  status: BranchOrderStatus;
  createdAt: string;
  processedAt: string | null;
  approvalLevels: readonly OrderTrackerApproval[];
}

export interface OrderTrackerNode {
  key: string;
  label: string;
  state: OrderTrackerState;
  at: string | null;
  badge: { code: string; name: string } | null;
}

interface TrackerStep {
  key: string;
  status: BranchOrderStatus;
  label: string;
  level: number | null;
}

type TrackerPosition =
  | { kind: "on-step"; index: number }
  | { kind: "approved" }
  | { kind: "closed"; status: "rejected" | "cancelled" }
  | { kind: "before" }
  | { kind: "after-chain" };

const ORDER_HISTORY_TIME = new Intl.DateTimeFormat("en-PH", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Manila",
});

export function formatOrderHistoryWhen(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return ORDER_HISTORY_TIME.format(date);
}

function trackerSteps(orderType: BranchOrderType): TrackerStep[] {
  const chain = getOrderApprovalChain(orderType);
  return [
    ...chain.map((step) => ({
      key: step.status,
      status: step.status,
      label: BRANCH_ORDER_STATUS_LABELS[step.status],
      level: step.level,
    })),
    {
      key: "approved",
      status: "approved",
      label: BRANCH_ORDER_STATUS_LABELS.approved,
      level: null,
    },
  ];
}

function approvalAt(
  levels: readonly OrderTrackerApproval[],
  level: number | null,
): OrderTrackerApproval | undefined {
  if (level == null) return undefined;
  return levels.find((row) => row.level === level);
}

function position(status: BranchOrderStatus, steps: readonly TrackerStep[]): TrackerPosition {
  switch (status) {
    case "approved":
      return { kind: "approved" };
    case "rejected":
      return { kind: "closed", status: "rejected" };
    case "cancelled":
      return { kind: "closed", status: "cancelled" };
    case "pending_logistics":
      return { kind: "after-chain" };
    case "draft":
    case "pending_ps":
      return { kind: "before" };
    case "pending_tl":
    case "pending_sp": {
      const index = steps.findIndex((step) => step.status === status);
      return index === -1 ? { kind: "before" } : { kind: "on-step", index };
    }
    default: {
      const unreachable: never = status;
      return unreachable;
    }
  }
}

function chainStepPassed(
  index: number,
  steps: readonly TrackerStep[],
  input: OrderHistoryTrackerInput,
  pos: TrackerPosition,
): boolean {
  const step = steps[index];
  if (!step || step.level == null) return false;
  if (approvalAt(input.approvalLevels, step.level)?.approvedAt) return true;

  switch (pos.kind) {
    case "approved":
    case "after-chain":
      return true;
    case "on-step":
      return pos.index > index;
    case "closed": {
      const rejected = input.approvalLevels.find((row) => row.rejectedAt);
      if (!rejected) return false;
      const rejectedIndex = steps.findIndex((item) => item.level === rejected.level);
      return rejectedIndex > index;
    }
    case "before":
      return false;
    default: {
      const unreachable: never = pos;
      return unreachable;
    }
  }
}

function enteredAt(
  index: number,
  steps: readonly TrackerStep[],
  input: OrderHistoryTrackerInput,
): string | null {
  const step = steps[index];
  if (!step) return null;
  if (step.status === "approved") {
    if (input.processedAt) return input.processedAt;
    const previous = steps[index - 1];
    return approvalAt(input.approvalLevels, previous?.level ?? null)?.approvedAt ?? null;
  }
  if (index === 0) {
    return getInitialOrderStatus(input.orderType) === step.status ? input.createdAt : null;
  }
  const previous = steps[index - 1];
  return approvalAt(input.approvalLevels, previous?.level ?? null)?.approvedAt ?? null;
}

export function buildOrderHistoryTracker(input: OrderHistoryTrackerInput): OrderTrackerNode[] {
  const steps = trackerSteps(input.orderType);
  const approvedIndex = steps.length - 1;
  const pos = position(input.status, steps);

  let proven = 0;
  for (let index = 0; index < approvedIndex; index += 1) {
    if (!chainStepPassed(index, steps, input, pos)) break;
    proven += 1;
  }

  const nodes: OrderTrackerNode[] = [];
  for (let index = 0; index < approvedIndex; index += 1) {
    const step = steps[index];
    if (!step) continue;
    const state: OrderTrackerState =
      index < proven
        ? "completed"
        : pos.kind === "on-step" && pos.index === index
          ? "current"
          : "upcoming";
    nodes.push({
      key: step.key,
      label: step.label,
      state,
      at: state === "upcoming" ? null : enteredAt(index, steps, input),
      badge: null,
    });
  }

  if (pos.kind === "closed") {
    const rejected = input.approvalLevels.find((row) => row.rejectedAt);
    const label = BRANCH_ORDER_STATUS_LABELS[pos.status];
    nodes.splice(proven, 0, {
      key: pos.status,
      label,
      state: pos.status,
      at: rejected?.rejectedAt ?? null,
      badge: { code: pos.status, name: label },
    });
  }

  const approved = steps[approvedIndex];
  const approvedComplete = pos.kind === "approved" && proven === approvedIndex;
  if (approved) {
    nodes.push({
      key: approved.key,
      label: approved.label,
      state: approvedComplete ? "completed" : "upcoming",
      at: approvedComplete ? enteredAt(approvedIndex, steps, input) : null,
      badge: null,
    });
  }

  return nodes;
}
