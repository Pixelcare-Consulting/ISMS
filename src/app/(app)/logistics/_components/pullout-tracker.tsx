"use client";

import {
  ProgressTracker,
  type ProgressNode,
  type ProgressStepState,
} from "@/app/(app)/logistics/_components/progress-tracker";

/**
 * Progress for a branch pull-out. Steps are only the statuses this flow writes.
 * A waybill or a scheduled date does not move the tracker.
 */

const TRACKER_STEPS = [
  { code: "pending_tl", fallback: "Reserve pull-out" },
  { code: "for_pullout", fallback: "For pull-out" },
  { code: "pending_logistics", fallback: "Pending logistics" },
  { code: "in_transit", fallback: "In transit" },
] as const;

type TrackerStepCode = (typeof TRACKER_STEPS)[number]["code"];

type WorkflowCode =
  | "requested"
  | "approved"
  | "draft"
  | "pending_tl"
  | "for_pullout"
  | "scheduled"
  | "pending_logistics"
  | "in_transit"
  | "pulled_out"
  | "completed"
  | "cancelled";

type TrackerMode = { kind: "active"; index: number } | { kind: "cancelled" } | { kind: "recorded" };

function asWorkflowCode(code: string): WorkflowCode | null {
  switch (code) {
    case "requested":
    case "approved":
    case "draft":
    case "pending_tl":
    case "for_pullout":
    case "scheduled":
    case "pending_logistics":
    case "in_transit":
    case "pulled_out":
    case "completed":
    case "cancelled":
      return code;
    default:
      return null;
  }
}

function trackerMode(code: string): TrackerMode {
  const known = asWorkflowCode(code);
  if (!known) return { kind: "recorded" };
  switch (known) {
    case "pending_tl":
      return { kind: "active", index: 0 };
    case "for_pullout":
      return { kind: "active", index: 1 };
    case "pending_logistics":
      return { kind: "active", index: 2 };
    case "in_transit":
      return { kind: "active", index: 3 };
    case "cancelled":
      return { kind: "cancelled" };
    case "requested":
    case "approved":
    case "draft":
    case "scheduled":
    case "pulled_out":
    case "completed":
      return { kind: "recorded" };
    default: {
      const unreachable: never = known;
      return unreachable;
    }
  }
}

function earliestAction(history: { action: string; at: string }[], action: string): string | null {
  let earliest: string | null = null;
  for (const row of history) {
    if (row.action !== action) continue;
    if (!earliest || row.at < earliest) earliest = row.at;
  }
  return earliest;
}

function occurredAt(
  code: TrackerStepCode,
  createdAt: string,
  history: { action: string; at: string }[],
): string | null {
  switch (code) {
    case "pending_tl":
      return earliestAction(history, "pullout.created") ?? (createdAt.trim() || null);
    case "for_pullout":
      return earliestAction(history, "pullout.approved");
    case "pending_logistics":
      return earliestAction(history, "pullout.list_saved");
    case "in_transit":
      return earliestAction(history, "pullout.finalized");
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

function stepLabel(
  code: TrackerStepCode,
  fallback: string,
  status: { code: string; name: string },
): string {
  return status.code === code && status.name.trim() ? status.name.trim() : fallback;
}

function buildTracker(
  status: { code: string; name: string; color: string | null },
  createdAt: string,
  history: { action: string; at: string }[],
): ProgressNode[] {
  const mode = trackerMode(status.code);
  const times = TRACKER_STEPS.map((step) => occurredAt(step.code, createdAt, history));
  const provenCount = prefixCount(times);
  const nodes: ProgressNode[] = TRACKER_STEPS.map((step, index) => {
    const label = stepLabel(step.code, step.fallback, status);
    if (mode.kind === "active") {
      const state: ProgressStepState =
        index < mode.index ? "completed" : index === mode.index ? "current" : "upcoming";
      return {
        key: step.code,
        label,
        state,
        at: state === "upcoming" ? null : times[index] ?? null,
        color: null,
      };
    }
    const completed = index < provenCount;
    return {
      key: step.code,
      label,
      state: completed ? "completed" : "upcoming",
      at: completed ? times[index] ?? null : null,
      color: null,
    };
  });

  if (mode.kind === "cancelled") {
    nodes.splice(provenCount, 0, {
      key: "cancelled",
      label: status.name.trim() || "Cancelled",
      state: "cancelled",
      at: earliestAction(history, "pullout.rejected"),
      color: status.color,
    });
  }

  return nodes;
}

export function PulloutTracker({
  status,
  createdAt,
  history,
}: {
  status: { code: string; name: string; color: string | null };
  createdAt: string;
  history: { action: string; at: string }[];
}) {
  return (
    <ProgressTracker
      ariaLabel="Pull-out progress"
      items={buildTracker(status, createdAt, history)}
    />
  );
}
