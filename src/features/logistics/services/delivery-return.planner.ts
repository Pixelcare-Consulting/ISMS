import type { DeliveryReturnStatus, SapOrderDocType } from "@prisma/client";

import type { DeliveryPostingView, PlanFailure } from "@/features/logistics/services/delivery-posting.planner";

/**
 * Return of a dispatched delivery's in-transit units: all of them, or the ones
 * the branch ticked. The operator requests it, an approver (TL) decides, and
 * only after SAP has the IT (consignment) or Return (outright) do the units go
 * back: to the warehouse location they were dispatched from, or, for a unit
 * dispatched from SAP's placement, to the source warehouse per SAP.
 */

/** A request in either status still holds its units: they cannot be received or rejected again. */
export const OPEN_RETURN_STATUSES = ["PENDING_APPROVAL", "APPROVED"] as const satisfies readonly DeliveryReturnStatus[];

export const RETURN_ALREADY_OPEN_ERROR = "Some units are already waiting on a reject request";
export const RETURN_ON_TRANSFER_ERROR = "Finish or remove the open unit transfer first.";
export const RETURN_REASON_MAX = 500;
export const RETURN_LINE_REMARKS_MAX = 200;
/** Remarks when the branch rejects units without typing any. */
export const DEFAULT_REJECT_REMARKS = "Rejected at branch receiving";

export type ReturnLinePlan = { serialNumberId: string; warehouseLocationToId: string | null };

export function planReturnRequest(
  d: DeliveryPostingView,
  /** DIT units already on a pending or approved reject request. */
  onOpenReturn: ReadonlySet<string>,
  /** DIT units held by a pending or approved unit-transfer line. */
  onOpenTransfer: ReadonlySet<string> = new Set(),
  /** Units to return; null returns every unit still in transit. */
  requestedSerialIds: readonly string[] | null = null,
): { ok: true; lines: ReturnLinePlan[] } | PlanFailure {
  if (d.status !== "pending" && d.status !== "partial") {
    return { ok: false, error: "Only a dispatched delivery still pending acceptance can be returned" };
  }

  const inTransit = d.lines.filter((line) => line.branchStatus === "DIT");
  if (inTransit.length === 0) return { ok: false, error: "No units are in transit on this delivery" };

  // "Reject everything" means every unit not already on a request.
  let returning = inTransit.filter((line) => !onOpenReturn.has(line.serialNumberId));
  if (requestedSerialIds === null && returning.length === 0) return { ok: false, error: RETURN_ALREADY_OPEN_ERROR };
  if (requestedSerialIds !== null) {
    const requested = new Set(requestedSerialIds);
    if (requested.size === 0) return { ok: false, error: "Tick the units to return" };
    if (requested.size !== requestedSerialIds.length) {
      return { ok: false, error: "A unit was listed twice on the return" };
    }
    returning = inTransit.filter((line) => requested.has(line.serialNumberId));
    if (returning.length !== requested.size) {
      return { ok: false, error: "Some units are not in transit on this delivery" };
    }
    if (returning.some((line) => onOpenReturn.has(line.serialNumberId))) {
      return { ok: false, error: RETURN_ALREADY_OPEN_ERROR };
    }
  }
  if (returning.some((line) => onOpenTransfer.has(line.serialNumberId))) {
    return { ok: false, error: RETURN_ON_TRANSFER_ERROR };
  }

  const lines: ReturnLinePlan[] = returning.map((line) => ({
    serialNumberId: line.serialNumberId,
    warehouseLocationToId: line.warehouseLocationFromId,
  }));
  return { ok: true, lines };
}

export const RETURN_NO_SAP_ORDER_ERROR =
  "This delivery was dispatched before SAP posting was enabled. Accept or transfer its units instead.";
export const RETURN_NO_SAP_DR_ERROR = "This delivery has no DR in SAP. Accept or transfer its units instead.";

/**
 * A return always posts to SAP (IT or Return on the DR), so refuse up front a
 * delivery that can never post one: an order with no stored SAP type, or an
 * outright (SO) delivery without its DR. Otherwise the request would hold the
 * delivery forever.
 */
export function planReturnSapReady(input: {
  orderSapDocType: SapOrderDocType | null;
  sapDocEntry: number | null;
}): { ok: true } | PlanFailure {
  if (!input.orderSapDocType) return { ok: false, error: RETURN_NO_SAP_ORDER_ERROR };
  if (input.orderSapDocType === "SO" && input.sapDocEntry == null) {
    return { ok: false, error: RETURN_NO_SAP_DR_ERROR };
  }
  return { ok: true };
}

/** An approved return can still be cancelled while SAP has no document for it. */
export function planReturnCancel(
  request: { status: DeliveryReturnStatus; sapDocEntry: number | null },
  note: string,
): { ok: true } | PlanFailure {
  if (request.status !== "APPROVED") {
    return { ok: false, error: "Only an approved return waiting for SAP can be cancelled" };
  }
  if (request.sapDocEntry != null) {
    return { ok: false, error: "SAP already has this return. It cannot be cancelled." };
  }
  if (!note) return { ok: false, error: "Enter the reason for cancelling the return" };
  return { ok: true };
}

export function planReturnDecision(
  status: DeliveryReturnStatus,
  action: "APPROVE" | "REJECT",
): { ok: true; next: "APPROVED" | "CANCELLED" } | PlanFailure {
  if (status !== "PENDING_APPROVAL") {
    return { ok: false, error: "This return request has already been decided" };
  }
  return { ok: true, next: action === "APPROVE" ? "APPROVED" : "CANCELLED" };
}

/**
 * Delivery status once a return completes (R8b). Units still in transit keep
 * the delivery open as partial. Otherwise it closes: rejected when every unit
 * went back on a return, accepted when any reached stock or left on a unit
 * transfer. Anything but pending or partial is not a delivery a return can
 * complete on.
 */
export function planReturnSettle(input: {
  status: string;
  stillInTransit: number;
  allReturned: boolean;
}): "accepted" | "partial" | "rejected" | null {
  if (input.status !== "pending" && input.status !== "partial") return null;
  if (input.stillInTransit > 0) return "partial";
  return input.allReturned ? "rejected" : "accepted";
}

export function nextReturnNo(): string {
  return `RTN-${Date.now().toString(36).toUpperCase()}`;
}
