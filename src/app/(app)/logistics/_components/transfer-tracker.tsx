"use client";

import {
  progressEventsForActions,
  ProgressTracker,
  type ProgressAuditRow,
  type ProgressStageIcon,
} from "@/app/(app)/logistics/_components/progress-tracker";
import {
  TRANSFER_SETTLED_CODES,
  TRANSFER_STOP_CODES,
  TRANSFER_WORKFLOW_CODE,
  type WorkflowStatusOption,
} from "@/features/logistics/constants/workflow-codes";
import { buildCatalogProgress } from "@/features/logistics/constants/workflow-progress";

/**
 * Progress for a branch transfer. Steps, names, colors, and order come from
 * the Transfer workflow codes in Status settings.
 */

type TransferAuditAction =
  | "transfer.created"
  | "transfer.approved"
  | "transfer.rejected"
  | "transfer.released"
  | "transfer.received"
  | "transfer.shipment_saved";

const TRANSFER_ICONS: Readonly<Record<string, ProgressStageIcon>> = {
  [TRANSFER_WORKFLOW_CODE.requested]: "approval",
  [TRANSFER_WORKFLOW_CODE.pending_tl]: "approval",
  [TRANSFER_WORKFLOW_CODE.approved]: "ready",
  [TRANSFER_WORKFLOW_CODE.for_transfer]: "ready",
  [TRANSFER_WORKFLOW_CODE.in_transit]: "transit",
  [TRANSFER_WORKFLOW_CODE.accepted]: "accepted",
  [TRANSFER_WORKFLOW_CODE.completed]: "accepted",
};

function asTransferAuditAction(action: string): TransferAuditAction | null {
  switch (action) {
    case "transfer.created":
    case "transfer.approved":
    case "transfer.rejected":
    case "transfer.released":
    case "transfer.received":
    case "transfer.shipment_saved":
      return action;
    default:
      return null;
  }
}

export function transferAuditLabel(action: string): string {
  const known = asTransferAuditAction(action);
  if (!known) return action;
  switch (known) {
    case "transfer.created":
      return "Request submitted";
    case "transfer.approved":
      return "Approved by Team Lead";
    case "transfer.rejected":
      return "Rejected";
    case "transfer.released":
      return "Released — in transit";
    case "transfer.received":
      return "Units received";
    case "transfer.shipment_saved":
      return "Waybill and schedule saved";
    default: {
      const unreachable: never = known;
      return unreachable;
    }
  }
}

function historyAction(code: string): string | null {
  switch (code) {
    case TRANSFER_WORKFLOW_CODE.requested:
    case TRANSFER_WORKFLOW_CODE.pending_tl:
    case TRANSFER_WORKFLOW_CODE.draft:
      return "transfer.created";
    case TRANSFER_WORKFLOW_CODE.approved:
    case TRANSFER_WORKFLOW_CODE.for_transfer:
      return "transfer.approved";
    case TRANSFER_WORKFLOW_CODE.in_transit:
      return "transfer.released";
    case TRANSFER_WORKFLOW_CODE.accepted:
    case TRANSFER_WORKFLOW_CODE.completed:
      return "transfer.received";
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

function latestAction(history: readonly ProgressAuditRow[], action: string): string | null {
  let latest: string | null = null;
  for (const row of history) {
    if (row.action !== action) continue;
    if (!latest || row.at > latest) latest = row.at;
  }
  return latest;
}

function occurredAt(code: string, statusCode: string, history: readonly ProgressAuditRow[]): string | null {
  const action = historyAction(code);
  if (!action) return null;
  if (code === TRANSFER_WORKFLOW_CODE.accepted || code === TRANSFER_WORKFLOW_CODE.completed) {
    return statusCode === code ? latestAction(history, action) : null;
  }
  return earliestAction(history, action);
}

export function buildTransferTracker(
  status: { code: string; name: string; color: string | null },
  history: readonly ProgressAuditRow[],
  catalog: readonly WorkflowStatusOption[],
) {
  return buildCatalogProgress({
    catalog,
    status,
    stopCodes: TRANSFER_STOP_CODES,
    settledCodes: TRANSFER_SETTLED_CODES,
    icons: TRANSFER_ICONS,
    occurredAt: (code) => occurredAt(code, status.code, history),
    eventsFor: (code) => {
      const action = historyAction(code);
      return progressEventsForActions(history, action ? [action] : [], transferAuditLabel);
    },
    stopAt: earliestAction(history, "transfer.rejected"),
    stopEvents: progressEventsForActions(history, ["transfer.rejected"], transferAuditLabel),
  });
}

export function TransferTracker({
  status,
  history,
  catalog,
}: {
  status: { code: string; name: string; color: string | null };
  history: readonly ProgressAuditRow[];
  catalog: readonly WorkflowStatusOption[];
}) {
  return (
    <ProgressTracker
      ariaLabel="Transfer progress"
      items={buildTransferTracker(status, history, catalog)}
    />
  );
}
