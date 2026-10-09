/**
 * Delivery posting rules. Dispatch, accept, and reject either post every
 * requested unit or change nothing. A second attempt of a finished post does
 * not move the same unit again.
 *
 * Status names stay the existing delivery workflow codes. Inventory stays
 * DIT while in transit and STK only after the branch accepts.
 */

export type DeliveryWorkflowCode =
  | "approved"
  | "pending"
  | "accepted"
  | "rejected"
  | "partial"
  | "requested";

export type BranchUnitStatus = "DIT" | "STK" | "SLD" | "DEF" | "OTHER";

export interface PostedLine {
  serialNumberId: string;
  warehouseLocationFromId: string | null;
  branchStatus: BranchUnitStatus | null;
}

export interface DeliveryPostingView {
  id: string;
  branchId: string;
  status: DeliveryWorkflowCode;
  lines: PostedLine[];
  /** Approved quantity per model on the order. Empty when nothing was approved. */
  requirements: { modelId: string; quantity: number }[];
}

export interface WarehouseHold {
  serialNumberId: string;
  modelId: string;
  warehouseId: string;
  warehouseLocationId: string;
}

export type PlanFailure = { ok: false; error: string };

export interface DispatchPlan {
  ok: true;
  warehouseId: string;
  moves: { serialNumberId: string; warehouseLocationId: string }[];
}

export interface AcceptPlan {
  ok: true;
  nextStatus: "accepted" | "partial";
  /** Serials that still need DIT → STK in this attempt. */
  moveSerialIds: string[];
  /** Units this attempt accounts for, including ones already in stock on a retry. */
  movedCount: number;
  idempotent: boolean;
}

export interface RejectPlan {
  ok: true;
  idempotent: boolean;
  returns: { serialNumberId: string; warehouseLocationId: string }[];
}

function unique(ids: string[]): string[] | null {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) return null;
    seen.add(id);
  }
  return ids;
}

export function planDispatch(
  delivery: DeliveryPostingView,
  holds: WarehouseHold[],
  serialNumberIds: string[],
): DispatchPlan | PlanFailure {
  if (delivery.status === "pending" || delivery.status === "partial" || delivery.status === "accepted") {
    return { ok: false, error: "This delivery has already been dispatched" };
  }
  if (delivery.status === "rejected") {
    return { ok: false, error: "A rejected delivery cannot be dispatched" };
  }
  if (delivery.status !== "approved") {
    return { ok: false, error: "Only an approved delivery can be dispatched" };
  }
  if (delivery.requirements.length === 0 || delivery.requirements.some((row) => row.quantity < 1)) {
    return { ok: false, error: "This delivery has no approved quantity to dispatch" };
  }

  const requested = unique(serialNumberIds);
  if (!requested || requested.length === 0) {
    return { ok: false, error: "Select the serials to dispatch" };
  }

  const requiredTotal = delivery.requirements.reduce((sum, row) => sum + row.quantity, 0);
  if (requested.length !== requiredTotal) {
    return {
      ok: false,
      error: `Dispatch needs ${requiredTotal} warehouse serial${requiredTotal === 1 ? "" : "s"} for the approved quantity`,
    };
  }

  const holdById = new Map(holds.map((hold) => [hold.serialNumberId, hold]));
  const moves: DispatchPlan["moves"] = [];
  const countedByModel = new Map<string, number>();
  let warehouseId: string | null = null;

  for (const serialNumberId of requested) {
    const hold = holdById.get(serialNumberId);
    if (!hold) {
      return {
        ok: false,
        error: "One or more serials are missing, already allocated, or not in that warehouse",
      };
    }
    if (warehouseId && hold.warehouseId !== warehouseId) {
      return { ok: false, error: "Dispatch serials must come from the same warehouse" };
    }
    warehouseId = hold.warehouseId;
    countedByModel.set(hold.modelId, (countedByModel.get(hold.modelId) ?? 0) + 1);
    moves.push({
      serialNumberId,
      warehouseLocationId: hold.warehouseLocationId,
    });
  }

  for (const requirement of delivery.requirements) {
    const counted = countedByModel.get(requirement.modelId) ?? 0;
    if (counted !== requirement.quantity) {
      return {
        ok: false,
        error: "The selected serials do not match the approved model and quantity",
      };
    }
  }
  if (countedByModel.size !== delivery.requirements.length) {
    return {
      ok: false,
      error: "The selected serials do not match the approved model and quantity",
    };
  }

  return { ok: true, warehouseId: warehouseId ?? "", moves };
}

export function planAccept(
  delivery: DeliveryPostingView,
  requestedSerialIds: string[] | null,
): AcceptPlan | PlanFailure {
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

export function planReject(delivery: DeliveryPostingView): RejectPlan | PlanFailure {
  if (delivery.status === "rejected") {
    return { ok: true, idempotent: true, returns: [] };
  }
  if (delivery.status === "accepted") {
    return { ok: false, error: "An accepted delivery cannot be rejected" };
  }

  const inTransit = delivery.lines.filter((line) => line.branchStatus === "DIT");
  if (delivery.status !== "pending" && delivery.status !== "partial") {
    return { ok: true, idempotent: false, returns: [] };
  }
  if (inTransit.length === 0) {
    return { ok: true, idempotent: false, returns: [] };
  }

  const returns: RejectPlan["returns"] = [];
  for (const line of inTransit) {
    if (!line.warehouseLocationFromId) {
      return {
        ok: false,
        error: "A dispatched serial has no warehouse location to return to",
      };
    }
    returns.push({
      serialNumberId: line.serialNumberId,
      warehouseLocationId: line.warehouseLocationFromId,
    });
  }

  return { ok: true, idempotent: false, returns };
}

/** A claim that did not take every requested row must abort the whole post. */
export function assertExclusiveClaim(actual: number, expected: number, message: string): void {
  if (actual !== expected) {
    throw new Error(message);
  }
}
