/**
 * Delivery posting rules. Accept either posts every requested unit or changes
 * nothing, and a second attempt does not move the same unit again. Dispatch
 * happens in SAP (Copy To); see sap-copy-to-follow.planner.ts.
 *
 * Status names stay the existing delivery workflow codes. Inventory stays
 * DIT while in transit and STK only after the branch accepts.
 */

import type { DeliveryWorkflowCodeKey } from "@/features/logistics/constants/workflow-codes";

export type DeliveryWorkflowCode = DeliveryWorkflowCodeKey;

export type BranchUnitStatus = "DIT" | "STK" | "SLD" | "DEF" | "OTHER";

export interface PostedLine {
  serialNumberId: string;
  warehouseLocationFromId: string | null;
  branchStatus: BranchUnitStatus | null;
}

export interface DeliveryPostingView {
  id: string;
  branchId: string;
  sourceWarehouseId: string | null;
  status: DeliveryWorkflowCode;
  lines: PostedLine[];
  /** Approved quantity per model on the order. Empty when nothing was approved. */
  requirements: { modelId: string; quantity: number }[];
}

export type PlanFailure = { ok: false; error: string };

export interface AcceptPlan {
  ok: true;
  nextStatus: "accepted" | "partial";
  /** Serials that still need DIT → STK in this attempt. */
  moveSerialIds: string[];
  /** Units this attempt accounts for, including ones already in stock on a retry. */
  movedCount: number;
  idempotent: boolean;
}

export const RETURN_WAITING_ERROR = "A return request for this delivery is waiting for approval";

function unique(ids: string[]): string[] | null {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) return null;
    seen.add(id);
  }
  return ids;
}

export function planAccept(
  delivery: DeliveryPostingView,
  requestedSerialIds: string[] | null,
  options: { openReturn?: boolean } = {},
): AcceptPlan | PlanFailure {
  if (options.openReturn && (delivery.status === "pending" || delivery.status === "partial")) {
    return { ok: false, error: RETURN_WAITING_ERROR };
  }
  if (delivery.lines.length === 0) {
    return { ok: false, error: "Delivery has no serials to accept" };
  }

  if (delivery.status === "accepted") {
    const allStock = delivery.lines.every((line) => line.branchStatus === "STK");
    if (!allStock) {
      return { ok: false, error: "Some serials are not in-transit at this branch" };
    }
    return {
      ok: true,
      nextStatus: "accepted",
      moveSerialIds: [],
      movedCount: delivery.lines.length,
      idempotent: true,
    };
  }

  if (delivery.status !== "pending" && delivery.status !== "partial") {
    return { ok: false, error: "Accept the delivery only after it has been dispatched" };
  }

  const requested = unique(requestedSerialIds ?? delivery.lines.map((line) => line.serialNumberId));
  if (!requested || requested.length === 0) {
    return { ok: false, error: "Delivery has no serials to accept" };
  }

  const lineById = new Map(delivery.lines.map((line) => [line.serialNumberId, line]));
  const moveSerialIds: string[] = [];
  let alreadyStock = 0;

  for (const serialNumberId of requested) {
    const line = lineById.get(serialNumberId);
    if (!line) {
      return { ok: false, error: "One or more serials are not on this delivery" };
    }
    if (line.branchStatus === "DIT") {
      moveSerialIds.push(serialNumberId);
      continue;
    }
    if (line.branchStatus === "STK") {
      alreadyStock += 1;
      continue;
    }
    return { ok: false, error: "Some serials are not in-transit at this branch" };
  }

  if (moveSerialIds.length === 0 && alreadyStock === 0) {
    return { ok: false, error: "Delivery has no serials to accept" };
  }

  const moving = new Set(moveSerialIds);
  const allPosted = delivery.lines.every((line) => {
    if (moving.has(line.serialNumberId)) return true;
    return line.branchStatus === "STK";
  });

  return {
    ok: true,
    nextStatus: allPosted ? "accepted" : "partial",
    moveSerialIds,
    movedCount: moveSerialIds.length + alreadyStock,
    idempotent: moveSerialIds.length === 0,
  };
}

export function planDeliverySettle(input: {
  totalLines: number;
  stillInTransit: number;
}): "accepted" | "partial" | null {
  if (input.totalLines === 0) return null;
  if (input.stillInTransit === 0) return "accepted";
  if (input.stillInTransit < input.totalLines) return "partial";
  return null;
}

/** A claim that did not take every requested row must abort the whole post. */
export function assertExclusiveClaim(actual: number, expected: number, message: string): void {
  if (actual !== expected) {
    throw new Error(message);
  }
}

/** Where a dispatched unit stands, as the receive dialog groups it. */
export type DeliveryReceiptLineState = "IN_TRANSIT" | "ON_TRANSFER" | "RECEIVED" | "TRANSFERRED";

/**
 * DIT units are in transit (or held by an open unit transfer). A unit that is no
 * longer at the delivery branch and was received on one of this delivery's unit
 * transfers left by transfer; anything else reached the branch.
 */
export function receiptLineState(input: {
  branchStatus: string | null;
  onOpenTransfer: boolean;
  receivedOnTransfer: boolean;
}): DeliveryReceiptLineState {
  if (input.branchStatus === "DIT") return input.onOpenTransfer ? "ON_TRANSFER" : "IN_TRANSIT";
  if (input.branchStatus === null && input.receivedOnTransfer) return "TRANSFERRED";
  return "RECEIVED";
}
