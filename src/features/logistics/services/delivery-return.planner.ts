import type { DeliveryReturnStatus, SapOrderDocType } from "@prisma/client";

import type { DeliveryPostingView, PlanFailure } from "@/features/logistics/services/delivery-posting.planner";

/**
 * Full return of a dispatched delivery's in-transit units. The operator
 * requests it, an approver decides, and only after SAP has the IT or Return do
 * the units go back: to the warehouse location they were dispatched from, or,
 * for a unit dispatched from SAP's placement, to the source warehouse per SAP.
 */

/** A request in either status still holds the delivery: one open request per delivery (partial unique index). */
export const OPEN_RETURN_STATUSES = ["PENDING_APPROVAL", "APPROVED"] as const satisfies readonly DeliveryReturnStatus[];

export const RETURN_ALREADY_OPEN_ERROR = "A return request for this delivery is already open";
export const RETURN_ON_TRANSFER_ERROR = "Finish or remove the open unit transfer first.";
export const RETURN_REASON_MAX = 500;

export type ReturnLinePlan = { serialNumberId: string; warehouseLocationToId: string | null };

export function planReturnRequest(
  d: DeliveryPostingView,
  openReturn: boolean,
  /** DIT units held by a pending or approved unit-transfer line. */
  onOpenTransfer: ReadonlySet<string> = new Set(),
): { ok: true; lines: ReturnLinePlan[] } | PlanFailure {
  if (d.status !== "pending" && d.status !== "partial") {
    return { ok: false, error: "Only a dispatched delivery still pending acceptance can be returned" };
  }
  if (openReturn) return { ok: false, error: RETURN_ALREADY_OPEN_ERROR };

  const inTransit = d.lines.filter((line) => line.branchStatus === "DIT");
  if (inTransit.length === 0) return { ok: false, error: "No units are in transit on this delivery" };
  if (inTransit.some((line) => onOpenTransfer.has(line.serialNumberId))) {
    return { ok: false, error: RETURN_ON_TRANSFER_ERROR };
  }

  const lines: ReturnLinePlan[] = inTransit.map((line) => ({
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
 * Delivery status once a return completes (R8b). Every in-transit unit went
 * back, so the delivery closes: `partial` (some units already reached stock)
 * becomes accepted, `pending` (none did) becomes rejected. Anything else is
 * not a delivery a return can complete on.
 */
export function planReturnSettle(status: string): "accepted" | "rejected" | null {
  if (status === "partial") return "accepted";
  if (status === "pending") return "rejected";
  return null;
}

export function nextReturnNo(): string {
  return `RTN-${Date.now().toString(36).toUpperCase()}`;
}
