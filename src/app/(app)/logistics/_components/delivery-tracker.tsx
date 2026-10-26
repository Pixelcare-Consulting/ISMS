"use client";

import {
  progressEventsForActions,
  ProgressTracker,
  type ProgressAuditRow,
  type ProgressNode,
  type ProgressStepState,
} from "@/app/(app)/logistics/_components/progress-tracker";

/**
 * Progress for a branch delivery. Steps are only the statuses this flow writes.
 * A step time comes only from the history action that recorded it.
 * A rejected delivery marks only steps that already have a time, then stops.
 * Partially accepted leaves Accepted as the current step.
 */

const TRACKER_STEPS = [
  { code: "approved", fallback: "Approved" },
  { code: "pending_acceptance", fallback: "Pending acceptance" },
  { code: "accepted", fallback: "Accepted" },
] as const;

type TrackerStepCode = (typeof TRACKER_STEPS)[number]["code"];

type DeliveryAuditAction =
  | "delivery.created_from_order"
  | "delivery.created"
  | "delivery.dispatched"
  | "delivery.accepted"
  | "delivery.rejected"
  | "delivery.sap_dispatch_posted";

function asDeliveryAuditAction(action: string): DeliveryAuditAction | null {
  switch (action) {
    case "delivery.created_from_order":
    case "delivery.created":
    case "delivery.dispatched":
    case "delivery.accepted":
    case "delivery.rejected":
    case "delivery.sap_dispatch_posted":
      return action;
    default:
      return null;
  }
}

export function deliveryAuditLabel(action: string): string {
  const known = asDeliveryAuditAction(action);
  if (!known) return action;
  switch (known) {
    case "delivery.created_from_order":
      return "Created from order";
    case "delivery.created":
      return "Delivery created";
    case "delivery.dispatched":
      return "Dispatched";
    case "delivery.accepted":
      return "Accepted";
    case "delivery.rejected":
      return "Rejected";
    case "delivery.sap_dispatch_posted":
      return "Dispatch posted";
    default: {
      const unreachable: never = known;
      return unreachable;
    }
  }
}

function stepAuditActions(code: TrackerStepCode): readonly string[] {
  switch (code) {
    case "approved":
      return ["delivery.created_from_order", "delivery.created"];
    case "pending_acceptance":
      return ["delivery.dispatched"];
    case "accepted":
      return ["delivery.accepted"];
    default: {
      const unreachable: never = code;
      return unreachable;
    }
  }
}

type KnownStatus = "approved" | "pending" | "partial" | "accepted" | "rejected" | "requested";

type TrackerMode =
  | { kind: "active"; index: number; finishCurrent: boolean }
  | { kind: "stopped" }
  | { kind: "recorded" };

function asKnownStatus(code: string): KnownStatus | null {
  switch (code) {
    case "approved":
    case "pending":
    case "partial":
    case "accepted":
    case "rejected":
    case "requested":
      return code;
    default:
      return null;
  }
}

function trackerMode(code: string): TrackerMode {
  const known = asKnownStatus(code);
  if (!known) return { kind: "recorded" };
  switch (known) {
    case "approved":
      return { kind: "active", index: 0, finishCurrent: false };
    case "pending":
      return { kind: "active", index: 1, finishCurrent: false };
    case "partial":
      return { kind: "active", index: 2, finishCurrent: false };
    case "accepted":
      return { kind: "active", index: 2, finishCurrent: true };
    case "rejected":
      return { kind: "stopped" };
    case "requested":
      return { kind: "recorded" };
    default: {
      const unreachable: never = known;
      return unreachable;
    }
  }
}

function earliestAction(history: readonly ProgressAuditRow[], actions: readonly string[]): string | null {
  const allowed = new Set(actions);
  let earliest: string | null = null;
  for (const row of history) {
    if (!allowed.has(row.action)) continue;
    if (!earliest || row.at < earliest) earliest = row.at;
  }
  return earliest;
}

function latestAction(history: readonly ProgressAuditRow[], action: string): string | null {
  let latest: string | null = null;
  for (const row of history) {
    if (row.action !== action) continue;
    if (!latest || row.at > latest) latest = row.at;
  }
  return latest;
}

function occurredAt(code: TrackerStepCode, history: readonly ProgressAuditRow[]): string | null {
  switch (code) {
    case "approved":
    case "pending_acceptance":
      return earliestAction(history, stepAuditActions(code));
    case "accepted":
      return latestAction(history, "delivery.accepted");
    default: {
      const unreachable: never = code;
      return unreachable;
    }
  }
}

function prefixCount(times: (string | null)[]): number {
  let count = 0;
  for (const time of times) {
    if (!time) break;
    count += 1;
  }
  return count;
}

function nodeState(index: number, mode: TrackerMode, provenCount: number): ProgressStepState {
  switch (mode.kind) {
    case "active":
      if (index < mode.index) return "completed";
      if (index > mode.index) return "upcoming";
      return mode.finishCurrent ? "completed" : "current";
    case "stopped":
    case "recorded":
      return index < provenCount ? "completed" : "upcoming";
    default: {
      const unreachable: never = mode;
      return unreachable;
    }
  }
}

function stoppedLabel(status: { name: string }): string {
  const name = status.name.trim();
  if (name) return name;
  return "Rejected";
}

function buildTracker(
  status: { code: string; name: string; color: string | null },
  history: readonly ProgressAuditRow[],
): ProgressNode[] {
  const mode = trackerMode(status.code);
  const times = TRACKER_STEPS.map((step) => occurredAt(step.code, history));
  const provenCount = prefixCount(times);
  const nodes: ProgressNode[] = TRACKER_STEPS.map((step, index) => {
    const state = nodeState(index, mode, provenCount);
    return {
      key: step.code,
      label: step.fallback,
      state,
      at: state === "upcoming" ? null : times[index] ?? null,
      color: null,
      events: progressEventsForActions(history, stepAuditActions(step.code), deliveryAuditLabel),
    };
  });

  if (mode.kind === "stopped") {
    nodes.splice(provenCount, 0, {
      key: "rejected",
      label: stoppedLabel(status),
      state: "cancelled",
      at: earliestAction(history, ["delivery.rejected"]),
      color: status.color,
      badgeCode: status.code,
      events: progressEventsForActions(history, ["delivery.rejected"], deliveryAuditLabel),
    });
  }

  return nodes;
}

export function DeliveryTracker({
  status,
  history,
}: {
  status: { code: string; name: string; color: string | null };
  history: readonly ProgressAuditRow[];
}) {
  return <ProgressTracker ariaLabel="Delivery progress" items={buildTracker(status, history)} />;
}
