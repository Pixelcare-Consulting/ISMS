"use client";

import {
  progressEventsForActions,
  ProgressTracker,
  type ProgressAuditRow,
  type ProgressStageIcon,
} from "@/app/(app)/logistics/_components/progress-tracker";
import {
  DELIVERY_SETTLED_CODES,
  DELIVERY_STOP_CODES,
  DELIVERY_WORKFLOW_CODE,
  type WorkflowStatusOption,
} from "@/features/logistics/constants/workflow-codes";
import { buildCatalogProgress } from "@/features/logistics/constants/workflow-progress";

/**
 * Progress for a branch delivery. Steps, names, colors, and order come from
 * the Delivery workflow codes in Status settings. A rejected delivery marks
 * only steps that already have a time, then stops.
 */

type DeliveryAuditAction =
  | "delivery.created_from_order"
  | "delivery.created"
  | "delivery.dispatched"
  | "delivery.accepted"
  | "delivery.rejected"
  | "delivery.sap_dispatch_posted"
  | "delivery.shipment_saved";

const DELIVERY_ICONS: Readonly<Record<string, ProgressStageIcon>> = {
  [DELIVERY_WORKFLOW_CODE.requested]: "approval",
  [DELIVERY_WORKFLOW_CODE.approved]: "approval",
  [DELIVERY_WORKFLOW_CODE.pending]: "pending_acceptance",
  [DELIVERY_WORKFLOW_CODE.accepted]: "accepted",
  [DELIVERY_WORKFLOW_CODE.partial]: "accepted",
};

function asDeliveryAuditAction(action: string): DeliveryAuditAction | null {
  switch (action) {
    case "delivery.created_from_order":
    case "delivery.created":
    case "delivery.dispatched":
    case "delivery.accepted":
    case "delivery.rejected":
    case "delivery.sap_dispatch_posted":
    case "delivery.shipment_saved":
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
    case "delivery.shipment_saved":
      return "Waybill and schedule saved";
    default: {
      const unreachable: never = known;
      return unreachable;
    }
  }
}

function stepAuditActions(code: string): readonly string[] {
  switch (code) {
    case DELIVERY_WORKFLOW_CODE.requested:
    case DELIVERY_WORKFLOW_CODE.approved:
      return ["delivery.created_from_order", "delivery.created"];
    case DELIVERY_WORKFLOW_CODE.pending:
      return ["delivery.dispatched"];
    case DELIVERY_WORKFLOW_CODE.accepted:
    case DELIVERY_WORKFLOW_CODE.partial:
      return ["delivery.accepted"];
    default:
      return [];
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

function occurredAt(code: string, history: readonly ProgressAuditRow[]): string | null {
  switch (code) {
    case DELIVERY_WORKFLOW_CODE.requested:
    case DELIVERY_WORKFLOW_CODE.approved:
    case DELIVERY_WORKFLOW_CODE.pending:
      return earliestAction(history, stepAuditActions(code));
    case DELIVERY_WORKFLOW_CODE.accepted:
    case DELIVERY_WORKFLOW_CODE.partial:
      return latestAction(history, "delivery.accepted");
    default:
      return null;
  }
}

export function buildDeliveryTracker(
  status: { code: string; name: string; color: string | null },
  history: readonly ProgressAuditRow[],
  catalog: readonly WorkflowStatusOption[],
) {
  return buildCatalogProgress({
    catalog,
    status,
    stopCodes: DELIVERY_STOP_CODES,
    settledCodes: DELIVERY_SETTLED_CODES,
    icons: DELIVERY_ICONS,
    occurredAt: (code) => occurredAt(code, history),
    eventsFor: (code) => progressEventsForActions(history, stepAuditActions(code), deliveryAuditLabel),
    stopAt: earliestAction(history, ["delivery.rejected"]),
    stopEvents: progressEventsForActions(history, ["delivery.rejected"], deliveryAuditLabel),
  });
}

export function DeliveryTracker({
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
      ariaLabel="Delivery progress"
      items={buildDeliveryTracker(status, history, catalog)}
    />
  );
}
