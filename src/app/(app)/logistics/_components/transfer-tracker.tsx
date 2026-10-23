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
  { code: "pending_tl", fallback: "Pending TL" },
  { code: "for_transfer", fallback: "For transfer" },
  { code: "in_transit", fallback: "In transit" },
  { code: "accepted", fallback: "Accepted" },
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

function stepLabel(
  code: string,
  fallback: string,
  index: number,
  status: { code: string; name: string },
  mode: TrackerMode,
): string {
  const current = mode.kind === "active" && mode.index === index;
  const name = status.name.trim();
  if (name && (current || status.code === code)) return name;
  return fallback;
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
    const label = stepLabel(step.code, step.fallback, index, status, mode);
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

export function TransferTracker({
  status,
  history,
}: {
  status: { code: string; name: string; color: string | null };
  history: { action: string; at: string }[];
}) {
  return <ProgressTracker ariaLabel="Transfer progress" items={buildTracker(status, history)} />;
}
