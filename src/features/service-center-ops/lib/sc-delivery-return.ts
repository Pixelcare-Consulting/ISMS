import type { DeliveryReturnStatus } from "@prisma/client";

import type { DeliveryReceiptLine } from "@/features/logistics/services/delivery-posting.service";
import { OPEN_RETURN_STATUSES } from "@/features/logistics/services/delivery-return.planner";

/**
 * Rules for rejecting units of an SC delivery at receipt (the branch reject, for a SAP DR made
 * from an SC order). Confirming the reject approves it; ISMS posts a SAP Return for the order's
 * customer, then the units leave the service center and go back to the order's SAP warehouse.
 */

/** A request in either status still holds its units: they cannot be received or rejected again. */
export const SC_OPEN_RETURN_STATUSES = OPEN_RETURN_STATUSES;

/** Remarks when the service center rejects units without typing any. */
export const SC_DEFAULT_REJECT_REMARKS = "Rejected at service center receiving";

export const SC_RETURN_ALREADY_OPEN_ERROR = "Some units are already waiting on a reject request";

export function isOpenScReturn(status: DeliveryReturnStatus): boolean {
  return (SC_OPEN_RETURN_STATUSES as readonly DeliveryReturnStatus[]).includes(status);
}

export function nextScReturnNo(): string {
  return `SCRJ-${Date.now().toString(36).toUpperCase()}`;
}

/** A DR serial on an SC delivery, as reject and receive see it. */
export interface ScDeliveryLineState {
  serialNumberId: string;
  acceptedAt: Date | null;
  returnedAt: Date | null;
}

/** Neither received nor sent back: still receivable or rejectable, unless an open reject holds it. */
export function isScLineInTransit(line: Pick<ScDeliveryLineState, "acceptedAt" | "returnedAt">): boolean {
  return line.acceptedAt === null && line.returnedAt === null;
}

export type ScReturnPlan = { ok: true; serialNumberIds: string[] } | { ok: false; error: string };

/**
 * Checks a reject of the ticked units. Only a SAP DR delivery from an SC order, still pending
 * or partial, and only units in transit and not already on an open reject.
 */
export function planScReturnRequest(input: {
  status: string;
  fromOrder: boolean;
  lines: readonly ScDeliveryLineState[];
  onOpenReturn: ReadonlySet<string>;
  requestedSerialIds: readonly string[];
}): ScReturnPlan {
  if (!input.fromOrder) {
    return { ok: false, error: "Only a delivery from an SC order can be rejected here" };
  }
  if (input.status !== "pending" && input.status !== "partial") {
    return { ok: false, error: "Only a delivery still pending receipt can be rejected" };
  }
  const requested = new Set(input.requestedSerialIds);
  if (requested.size === 0) return { ok: false, error: "Tick the units to reject" };
  if (requested.size !== input.requestedSerialIds.length) {
    return { ok: false, error: "A unit was listed twice on the reject" };
  }
  const inTransit = new Set(input.lines.filter(isScLineInTransit).map((line) => line.serialNumberId));
  if ([...requested].some((id) => !inTransit.has(id))) {
    return { ok: false, error: "Some units are not in transit on this delivery" };
  }
  if ([...requested].some((id) => input.onOpenReturn.has(id))) {
    return { ok: false, error: SC_RETURN_ALREADY_OPEN_ERROR };
  }
  return { ok: true, serialNumberIds: [...requested] };
}

export interface ScDeliveryUnit extends Omit<ScDeliveryLineState, "serialNumberId"> {
  serialNumberId: string;
  serialNo: string;
  skuCode: string;
  modelName: string;
  /** The open reject request holding the unit, if any. */
  openReturn: { id: string; requestNo: string } | null;
}

/** The DR's units as the branch receive dialog lists them. */
export function scDeliveryReceiptLines(units: readonly ScDeliveryUnit[]): DeliveryReceiptLine[] {
  return units.map((unit) => {
    const inTransit = isScLineInTransit(unit);
    const state: DeliveryReceiptLine["state"] = unit.returnedAt
      ? "RETURNED"
      : unit.acceptedAt
        ? "RECEIVED"
        : unit.openReturn
          ? "PENDING_REJECT"
          : "IN_TRANSIT";
    return {
      serialNumberId: unit.serialNumberId,
      serialNo: unit.serialNo,
      skuCode: unit.skuCode,
      modelName: unit.modelName,
      inTransit,
      openTransfer: null,
      openReturn: inTransit ? unit.openReturn : null,
      state,
    };
  });
}
