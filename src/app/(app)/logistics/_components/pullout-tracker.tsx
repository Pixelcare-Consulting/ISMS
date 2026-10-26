"use client";

import {
  progressEventsForActions,
  ProgressTracker,
  type ProgressAuditRow,
  type ProgressStageIcon,
} from "@/app/(app)/logistics/_components/progress-tracker";
import {
  PULLOUT_SETTLED_CODES,
  PULLOUT_STOP_CODES,
  PULLOUT_WORKFLOW_CODE,
  type WorkflowStatusOption,
} from "@/features/logistics/constants/workflow-codes";
import { buildCatalogProgress } from "@/features/logistics/constants/workflow-progress";

/**
 * Progress for a branch pull-out. Steps, names, colors, and order come from
 * the Pull-out workflow codes in Status settings. The pull-out reason is a
 * separate catalog and is not a step.
 */

type PulloutAuditAction =
  | "pullout.created"
  | "pullout.approved"
  | "pullout.rejected"
  | "pullout.list_saved"
  | "pullout.finalized";

const PULLOUT_ICONS: Readonly<Record<string, ProgressStageIcon>> = {
  [PULLOUT_WORKFLOW_CODE.requested]: "approval",
  [PULLOUT_WORKFLOW_CODE.pending_tl]: "approval",
  [PULLOUT_WORKFLOW_CODE.for_pullout]: "prepare",
  [PULLOUT_WORKFLOW_CODE.scheduled]: "ready",
  [PULLOUT_WORKFLOW_CODE.pending_logistics]: "ready",
  [PULLOUT_WORKFLOW_CODE.in_transit]: "transit",
  [PULLOUT_WORKFLOW_CODE.pulled_out]: "accepted",
  [PULLOUT_WORKFLOW_CODE.completed]: "accepted",
};

function asPulloutAuditAction(action: string): PulloutAuditAction | null {
  switch (action) {
    case "pullout.created":
    case "pullout.approved":
    case "pullout.rejected":
    case "pullout.list_saved":
    case "pullout.finalized":
      return action;
    default:
      return null;
  }
}

export function pulloutAuditLabel(action: string): string {
  const known = asPulloutAuditAction(action);
  if (!known) return action;
  switch (known) {
    case "pullout.created":
      return "Request submitted";
    case "pullout.approved":
      return "Approved by Team Lead";
    case "pullout.rejected":
      return "Rejected";
    case "pullout.list_saved":
      return "Logistics list saved";
    case "pullout.finalized":
      return "Sent — in transit";
    default: {
      const unreachable: never = known;
      return unreachable;
    }
  }
}

function historyAction(code: string): string | null {
  switch (code) {
    case PULLOUT_WORKFLOW_CODE.requested:
    case PULLOUT_WORKFLOW_CODE.pending_tl:
    case PULLOUT_WORKFLOW_CODE.draft:
      return "pullout.created";
    case PULLOUT_WORKFLOW_CODE.approved:
    case PULLOUT_WORKFLOW_CODE.for_pullout:
      return "pullout.approved";
    case PULLOUT_WORKFLOW_CODE.scheduled:
    case PULLOUT_WORKFLOW_CODE.pending_logistics:
      return "pullout.list_saved";
    case PULLOUT_WORKFLOW_CODE.in_transit:
    case PULLOUT_WORKFLOW_CODE.pulled_out:
    case PULLOUT_WORKFLOW_CODE.completed:
      return "pullout.finalized";
    default:
      return null;
  }
}

function earliestAction(history: readonly ProgressAuditRow[], action: string): string | null {
  let earliest: string | null = null;
  for (const row of history) {
    if (row.action !== action) continue;
    if (!earliest || row.at < earliest) earliest = row.at;
  }
  return earliest;
}

function occurredAt(
  code: string,
  createdAt: string,
  history: readonly ProgressAuditRow[],
): string | null {
  const action = historyAction(code);
  const at = action ? earliestAction(history, action) : null;
  if (code === PULLOUT_WORKFLOW_CODE.pending_tl || code === PULLOUT_WORKFLOW_CODE.requested) {
    return at ?? (createdAt.trim() || null);
  }
  return at;
}

export function buildPulloutTracker(
  status: { code: string; name: string; color: string | null },
  createdAt: string,
  history: readonly ProgressAuditRow[],
  catalog: readonly WorkflowStatusOption[],
) {
  return buildCatalogProgress({
    catalog,
    status,
    stopCodes: PULLOUT_STOP_CODES,
    settledCodes: PULLOUT_SETTLED_CODES,
    icons: PULLOUT_ICONS,
    occurredAt: (code) => occurredAt(code, createdAt, history),
    eventsFor: (code) => {
      const action = historyAction(code);
      return progressEventsForActions(history, action ? [action] : [], pulloutAuditLabel);
    },
    stopAt: earliestAction(history, "pullout.rejected"),
    stopEvents: progressEventsForActions(history, ["pullout.rejected"], pulloutAuditLabel),
  });
}

export function PulloutTracker({
  status,
  createdAt,
  history,
  catalog,
}: {
  status: { code: string; name: string; color: string | null };
  createdAt: string;
  history: readonly ProgressAuditRow[];
  catalog: readonly WorkflowStatusOption[];
}) {
  return (
    <ProgressTracker
      ariaLabel="Pull-out progress"
      items={buildPulloutTracker(status, createdAt, history, catalog)}
    />
  );
}
