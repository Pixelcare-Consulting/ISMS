import type { DeliveryTransferLineStatus, DeliveryTransferStatus } from "@prisma/client";

/**
 * Unit transfer rules for delivered units the branch did not accept (broken in
 * transit, wrong unit, and so on). Pure: the service loads state and applies
 * the plan in one transaction.
 *
 * Lifecycle: PENDING_APPROVAL (lines PENDING → APPROVED or REMOVED) → Release →
 * IN_TRANSIT (lines APPROVED → RECEIVED) → COMPLETED. All lines removed → CANCELLED.
 * An IN_TRANSIT transfer with no SAP IT and nothing received can also be
 * cancelled (lines APPROVED → REMOVED).
 */

export type TransferPlace =
  | { kind: "BRANCH"; branchId: string }
  | { kind: "WAREHOUSE"; warehouseId: string; warehouseLocationId: string };

export type PlanResult = { ok: true } | { ok: false; error: string };

export const OPEN_TRANSFER_LINE_STATUSES = ["PENDING", "APPROVED"] as const satisfies readonly DeliveryTransferLineStatus[];

export const ON_OPEN_TRANSFER_ERROR = "One or more units are already on an open transfer";

/** PENDING and APPROVED lines hold the unit: it cannot be accepted or put on another transfer. */
export function isOpenTransferLine(status: DeliveryTransferLineStatus): boolean {
  return (OPEN_TRANSFER_LINE_STATUSES as readonly string[]).includes(status);
}

/**
 * Release from the delivery branch; receive back into the source warehouse at
 * the location the unit was dispatched from. Receive stays empty when the
 * system cannot tell, and the user picks it.
 */
export function defaultTransferPlaces(
  delivery: { branchId: string; sourceWarehouseId: string | null },
  lineFromLocationId: string | null,
): { release: TransferPlace; receive: TransferPlace | null } {
  return {
    release: { kind: "BRANCH", branchId: delivery.branchId },
    receive:
      delivery.sourceWarehouseId && lineFromLocationId
        ? { kind: "WAREHOUSE", warehouseId: delivery.sourceWarehouseId, warehouseLocationId: lineFromLocationId }
        : null,
  };
}

export const TRANSFER_RETURN_OPEN_ERROR =
  "This delivery has an open return request. Finish it before creating a transfer.";

export function planTransferCreate(input: {
  deliveryStatus: string;
  hasOpenReturn?: boolean;
  units: { serialNumberId: string; branchStatus: string | null; onOpenTransfer: boolean }[];
}): PlanResult {
  if (input.deliveryStatus !== "pending" && input.deliveryStatus !== "partial") {
    return { ok: false, error: "Only a dispatched delivery that is not fully accepted can have a unit transfer" };
  }
  if (input.hasOpenReturn) {
    return { ok: false, error: TRANSFER_RETURN_OPEN_ERROR };
  }
  if (input.units.length === 0) {
    return { ok: false, error: "Select the units to transfer" };
  }
  const ids = new Set(input.units.map((unit) => unit.serialNumberId));
  if (ids.size !== input.units.length) {
    return { ok: false, error: "A unit is listed more than once" };
  }
  if (input.units.some((unit) => unit.branchStatus !== "DIT")) {
    return { ok: false, error: "Only units still in transit on this delivery can be transferred" };
  }
  if (input.units.some((unit) => unit.onOpenTransfer)) {
    return { ok: false, error: ON_OPEN_TRANSFER_ERROR };
  }
  return { ok: true };
}

export function planLineDecision(
  line: { status: DeliveryTransferLineStatus },
  action: "APPROVE" | "REMOVE" | "RECEIVE",
  transferStatus: DeliveryTransferStatus,
): { ok: true; next: DeliveryTransferLineStatus } | { ok: false; error: string } {
  switch (action) {
    case "APPROVE":
      if (transferStatus !== "PENDING_APPROVAL") {
        return { ok: false, error: "Lines can only be approved before the transfer is released" };
      }
      if (line.status !== "PENDING") return { ok: false, error: "Only a pending line can be approved" };
      return { ok: true, next: "APPROVED" };
    case "REMOVE":
      if (transferStatus !== "PENDING_APPROVAL") {
        return { ok: false, error: "Lines can only be deleted before the transfer is released" };
      }
      if (!isOpenTransferLine(line.status)) return { ok: false, error: "This line is already removed" };
      return { ok: true, next: "REMOVED" };
    case "RECEIVE":
      if (transferStatus !== "IN_TRANSIT") {
        return { ok: false, error: "Units can only be accepted while the transfer is in transit" };
      }
      if (line.status !== "APPROVED") return { ok: false, error: "Only an approved line can be accepted" };
      return { ok: true, next: "RECEIVED" };
    default: {
      const unreachable: never = action;
      return unreachable;
    }
  }
}

export function planRelease(lines: { status: DeliveryTransferLineStatus }[]): PlanResult {
  if (lines.some((line) => line.status === "PENDING")) {
    return { ok: false, error: "Approve or delete every pending line before releasing" };
  }
  if (!lines.some((line) => line.status === "APPROVED")) {
    return { ok: false, error: "Approve at least one line before releasing" };
  }
  return { ok: true };
}

export const RELEASE_NOT_DELIVERY_BRANCH_ERROR = "Release is the branch the delivery went to.";

/** R11: the units sit DIT at the delivery branch, so that branch is always the release place. */
export function planReleasePlace(
  release: { kind: "BRANCH" | "WAREHOUSE"; id: string },
  deliveryBranchId: string,
): PlanResult {
  if (release.kind !== "BRANCH" || release.id !== deliveryBranchId) {
    return { ok: false, error: RELEASE_NOT_DELIVERY_BRANCH_ERROR };
  }
  return { ok: true };
}

/**
 * A released transfer can be called off while nothing has moved: SAP has no IT
 * for it and no unit was received. The units are still DIT at the delivery branch.
 */
export function planInTransitCancel(input: {
  status: DeliveryTransferStatus;
  sapDocEntry: number | null;
  lines: { status: DeliveryTransferLineStatus }[];
}): PlanResult {
  if (input.status !== "IN_TRANSIT") {
    return { ok: false, error: "Only a released transfer in transit can be cancelled" };
  }
  if (input.sapDocEntry != null) {
    return { ok: false, error: "SAP already has this transfer. It cannot be cancelled." };
  }
  if (input.lines.some((line) => line.status === "RECEIVED")) {
    return { ok: false, error: "A unit on this transfer was already received. It cannot be cancelled." };
  }
  return { ok: true };
}

/**
 * Released consignment transfer whose SAP IT has not posted: units cannot be
 * received yet. Not for a transfer still pending approval or cancelled.
 */
export function isSapPending(input: {
  sapDocType: string | null;
  status: DeliveryTransferStatus;
  sapDocEntry: number | null;
}): boolean {
  return (
    input.sapDocType === "ITR" &&
    (input.status === "IN_TRANSIT" || input.status === "COMPLETED") &&
    input.sapDocEntry == null
  );
}

/** Header status once lines change, or null when it stays as it is. */
export function nextTransferStatus(
  current: DeliveryTransferStatus,
  lines: { status: DeliveryTransferLineStatus }[],
): DeliveryTransferStatus | null {
  if (lines.length === 0) return null;
  if (current === "PENDING_APPROVAL" && lines.every((line) => line.status === "REMOVED")) {
    return "CANCELLED";
  }
  if (
    current === "IN_TRANSIT" &&
    !lines.some((line) => line.status === "APPROVED") &&
    lines.some((line) => line.status === "RECEIVED")
  ) {
    return "COMPLETED";
  }
  return null;
}
