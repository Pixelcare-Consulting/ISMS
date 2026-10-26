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
  actorName?: string | null;
}

export interface OrderHistoryTrackerInput {
  orderType: BranchOrderType;
  status: BranchOrderStatus;
  createdAt: string;
  processedAt: string | null;
  createdByName?: string | null;
  approvalLevels: readonly OrderTrackerApproval[];
}

export interface OrderTrackerEvent {
  id: string;
  label: string | null;
  actor: string | null;
  at: string | null;
}

export interface OrderTrackerNode {
  key: string;
  label: string;
  state: OrderTrackerState;
  at: string | null;
  badge: { code: string; name: string } | null;
  events: OrderTrackerEvent[];
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

function railLabel(orderType: BranchOrderType, status: BranchOrderStatus): string {
  switch (orderType) {
    case "auto_replenish":
      return status === "pending_tl" ? "Waiting for approval" : BRANCH_ORDER_STATUS_LABELS[status];
    case "manual":
    case "special":
      return BRANCH_ORDER_STATUS_LABELS[status];
    default: {
      const unreachable: never = orderType;
      return unreachable;
    }
  }
}

function trackerSteps(orderType: BranchOrderType): TrackerStep[] {
  const chain = getOrderApprovalChain(orderType);
  return [
    ...chain.map((step) => ({
      key: step.status,
      status: step.status,
      label: railLabel(orderType, step.status),
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

function presentAt(value: string | null | undefined): string | null {
  if (!value || !value.trim()) return null;
  return value;
}

function actorOf(level: OrderTrackerApproval | undefined): string | null {
  const name = level?.actorName?.trim();
  return name ? name : null;
}

function sortEvents(events: OrderTrackerEvent[]): OrderTrackerEvent[] {
  return [...events].sort((left, right) => {
    if (left.at === right.at) return 0;
    if (!left.at) return 1;
    if (!right.at) return -1;
    return left.at < right.at ? -1 : 1;
  });
}

function submittedEvent(input: OrderHistoryTrackerInput): OrderTrackerEvent | null {
  const at = presentAt(input.createdAt);
  if (!at) return null;
  const actor = input.createdByName?.trim();
  return {
    id: "order-submitted",
    label: "Submitted",
    actor: actor ? actor : null,
    at,
  };
}

function approvedEvent(
  level: OrderTrackerApproval,
  id: string,
  label: string,
): OrderTrackerEvent | null {
  const at = presentAt(level.approvedAt);
  if (!at) return null;
  return { id, label, actor: actorOf(level), at };
}

function chainEvents(
  index: number,
  steps: readonly TrackerStep[],
  input: OrderHistoryTrackerInput,
  state: OrderTrackerState,
): OrderTrackerEvent[] {
  if (state === "upcoming") return [];
  const step = steps[index];
  if (!step) return [];
  const events: OrderTrackerEvent[] = [];

  if (index === 0 && getInitialOrderStatus(input.orderType) === step.status) {
    const submitted = submittedEvent(input);
    if (submitted) events.push(submitted);
  }

  if (index > 0) {
    const previous = steps[index - 1];
    const opener = approvalAt(input.approvalLevels, previous?.level ?? null);
    if (previous && opener) {
      const opened = approvedEvent(
        opener,
        `opened-${step.key}-${opener.level}`,
        `${previous.label} approved`,
      );
      if (opened) events.push(opened);
    }
  }

  if (step.level != null) {
    const level = approvalAt(input.approvalLevels, step.level);
    if (level) {
      const decided = approvedEvent(level, `approval-${step.key}-${level.level}`, "Approved");
      if (decided) events.push(decided);
    }
  }

  return sortEvents(events);
}

function approvedNodeEvents(
  steps: readonly TrackerStep[],
  input: OrderHistoryTrackerInput,
  complete: boolean,
): OrderTrackerEvent[] {
  if (!complete) return [];
  const previous = steps[steps.length - 2];
  const level = approvalAt(input.approvalLevels, previous?.level ?? null);
  const approvedAt = presentAt(level?.approvedAt);
  const processedAt = presentAt(input.processedAt);
  const events: OrderTrackerEvent[] = [];
  if (level && approvedAt) {
    events.push({
      id: `order-approved-${level.level}`,
      label: "Approved",
      actor: actorOf(level),
      at: approvedAt,
    });
  }
  if (processedAt && processedAt !== approvedAt) {
    events.push({
      id: "order-processed",
      label: "Approved",
      actor: null,
      at: processedAt,
    });
  }
  return sortEvents(events);
}

function closedEvents(
  input: OrderHistoryTrackerInput,
  status: "rejected" | "cancelled",
): OrderTrackerEvent[] {
  const level = input.approvalLevels.find((row) => presentAt(row.rejectedAt));
  const at = presentAt(level?.rejectedAt);
  if (!level || !at) return [];
  return [
    {
      id: `order-closed-${level.level}`,
      label: BRANCH_ORDER_STATUS_LABELS[status],
      actor: actorOf(level),
      at,
    },
  ];
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
      events: chainEvents(index, steps, input, state),
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
      events: closedEvents(input, pos.status),
    });
    return nodes.slice(0, proven + 1);
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
      events: approvedNodeEvents(steps, input, approvedComplete),
    });
  }

  return nodes;
}

/**
 * Open-page rail: Created, then that order type's approval chain, then Approved.
 * Auto replenish adds Waiting for approval before Pending SP.
 * Created uses the stored creator and time. Chain steps keep only approval rows.
 * A rejection or cancellation stops the rail on that step.
 */
export function buildSubmittedOrderProgress(input: OrderHistoryTrackerInput): OrderTrackerNode[] {
  const at = presentAt(input.createdAt);
  const actor = input.createdByName?.trim() || null;
  const created: OrderTrackerNode = {
    key: "created",
    label: "Created",
    state: "completed",
    at,
    badge: null,
    events: at
      ? [{ id: "order-created", label: "Order created", actor, at }]
      : [],
  };
  const chain = buildOrderHistoryTracker(input).map((node) => ({
    ...node,
    events: node.events.filter((event) => event.id !== "order-submitted"),
  }));
  return [created, ...chain];
}
