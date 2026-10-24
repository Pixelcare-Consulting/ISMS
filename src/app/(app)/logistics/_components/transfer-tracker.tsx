"use client";

import {
  ProgressTracker,
  type ProgressNode,
  type ProgressStepState,
} from "@/app/(app)/logistics/_components/progress-tracker";

/**
 * Progress for a branch transfer. Steps are only the statuses this flow writes.
 * A rejected or cancelled transfer does not complete later steps.
 * A step time comes only from the history action that recorded it.
 */

const TRACKER_STEPS = [
  { code: "pending_tl", label: "Waiting for approval" },
  { code: "for_transfer", label: "Ready to release" },
  { code: "in_transit", label: "In transit" },
  { code: "accepted", label: "Accepted" },
] as const;

type TrackerStepCode = (typeof TRACKER_STEPS)[number]["code"];

type KnownStatus =
  | "requested"
  | "approved"
  | "draft"
  | "pending_tl"
  | "for_transfer"
  | "in_transit"
  | "accepted"
  | "rejected"
  | "completed"
  | "cancelled";

type TrackerMode = { kind: "active"; index: number } | { kind: "stopped" } | { kind: "recorded" };

function asKnownStatus(code: string): KnownStatus | null {
  switch (code) {
    case "requested":
    case "approved":
    case "draft":
    case "pending_tl":
    case "for_transfer":
    case "in_transit":
    case "accepted":
    case "rejected":
    case "completed":
    case "cancelled":
      return code;
    default:
      return null;
  }
}

function trackerMode(code: string): TrackerMode {
  const known = asKnownStatus(code);
  if (!known) return { kind: "recorded" };
  switch (known) {
    case "pending_tl":
    case "requested":
      return { kind: "active", index: 0 };
    case "for_transfer":
    case "approved":
      return { kind: "active", index: 1 };
    case "in_transit":
      return { kind: "active", index: 2 };
    case "accepted":
      return { kind: "active", index: 3 };
    case "rejected":
    case "cancelled":
      return { kind: "stopped" };
    case "draft":
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

function latestAction(history: { action: string; at: string }[], action: string): string | null {
  let latest: string | null = null;
  for (const row of history) {
    if (row.action !== action) continue;
    if (!latest || row.at > latest) latest = row.at;
  }
  return latest;
}

function occurredAt(
  code: TrackerStepCode,
  statusCode: string,
  history: { action: string; at: string }[],
): string | null {
  switch (code) {
    case "pending_tl":
      return earliestAction(history, "transfer.created");
    case "for_transfer":
      return earliestAction(history, "transfer.approved");
    case "in_transit":
      return earliestAction(history, "transfer.released");
    case "accepted":
      return statusCode === "accepted" ? latestAction(history, "transfer.received") : null;
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

function stoppedLabel(status: { code: string; name: string }): string {
  const name = status.name.trim();
  if (name) return name;
  return status.code === "cancelled" ? "Cancelled" : "Rejected";
}

function buildTracker(
  status: { code: string; name: string; color: string | null },
  history: { action: string; at: string }[],
): ProgressNode[] {
  const mode = trackerMode(status.code);
  const times = TRACKER_STEPS.map((step) => occurredAt(step.code, status.code, history));
  const provenCount = prefixCount(times);
  const nodes: ProgressNode[] = TRACKER_STEPS.map((step, index) => {
    const label = step.label;
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

  if (mode.kind === "stopped") {
    nodes.splice(provenCount, 0, {
      key: status.code === "cancelled" ? "cancelled" : "rejected",
      label: stoppedLabel(status),
      state: "cancelled",
      at: earliestAction(history, "transfer.rejected"),
      color: status.color,
      badgeCode: status.code,
    });
  }

  return nodes;
}

type TrackerHistoryRow = { action: string; at: string; userName?: string | null };

export interface TransferFinishedStep {
  key: string;
  title: string;
  at: string | null;
  actor: string | null;
}

function asTrackerStepCode(code: string): TrackerStepCode | null {
  switch (code) {
    case "pending_tl":
    case "for_transfer":
    case "in_transit":
    case "accepted":
      return code;
    default:
      return null;
  }
}

function historyPick(code: TrackerStepCode): { action: string; pick: "earliest" | "latest" } {
  switch (code) {
    case "pending_tl":
      return { action: "transfer.created", pick: "earliest" };
    case "for_transfer":
      return { action: "transfer.approved", pick: "earliest" };
    case "in_transit":
      return { action: "transfer.released", pick: "earliest" };
    case "accepted":
      return { action: "transfer.received", pick: "latest" };
    default: {
      const unreachable: never = code;
      return unreachable;
    }
  }
}

function stepActor(code: string, at: string | null, history: TrackerHistoryRow[]): string | null {
  if (!at) return null;
  const step = asTrackerStepCode(code);
  if (!step) return null;
  const { action, pick } = historyPick(step);
  let match: TrackerHistoryRow | null = null;
  for (const row of history) {
    if (row.action !== action) continue;
    if (!match || (pick === "earliest" ? row.at < match.at : row.at > match.at)) match = row;
  }
  if (!match || match.at !== at) return null;
  const name = match.userName?.trim();
  return name ? name : null;
}

/** Finished jobs only. Same completion rules as the tracker rail. */
export function transferFinishedSteps(
  status: { code: string; name: string; color: string | null },
  history: TrackerHistoryRow[],
): TransferFinishedStep[] {
  return buildTracker(status, history)
    .filter((node) => node.state === "completed")
    .map((node) => ({
      key: node.key,
      title: node.label,
      at: node.at,
      actor: stepActor(node.key, node.at, history),
    }));
}

export function TransferTracker({
  status,
  history,
}: {
  status: { code: string; name: string; color: string | null };
  history: { action: string; at: string }[];
}) {
  return <ProgressTracker ariaLabel="Transfer progress" items={buildTracker(status, history)} />;
}
