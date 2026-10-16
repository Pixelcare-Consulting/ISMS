/**
 * Branch transfer rules. Approval holds the same branch row as reserved and
 * does not add destination stock. Receipt moves that row and restores the
 * code stored on the line, so a defective unit stays defective.
 */

import {
  classifyAllocation,
  uniqueSerialIds,
  type AllocatableSerial,
  type HoldCode,
  type InventoryCode,
  type PlanFailure,
} from "@/features/logistics/services/posting-planner-types";

export type TransferStatus =
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

export interface TransferLineView {
  serialNumberId: string;
  priorCode: HoldCode | null;
  inventoryCode: InventoryCode | null;
  /** Branch that currently holds the inventory row. Null when the row is missing. */
  branchId: string | null;
}

export interface TransferCreatePlan {
  ok: true;
  nextStatus: "pending_tl";
  holds: { serialNumberId: string; priorCode: HoldCode; nextCode: "RSV" }[];
}

export interface TransferApprovePlan {
  ok: true;
  nextStatus: "for_transfer";
  /** Legacy rows that were never reserved. Already-reserved lines are omitted. */
  holds: { serialNumberId: string; priorCode: HoldCode }[];
  idempotent: boolean;
  destinationStockAdded: false;
}

export interface TransferRejectPlan {
  ok: true;
  nextStatus: "rejected";
  restores: { serialNumberId: string; restoreCode: HoldCode }[];
  idempotent: boolean;
}

export interface TransferReleasePlan {
  ok: true;
  nextStatus: "in_transit";
  moves: { serialNumberId: string }[];
  idempotent: boolean;
}

export interface TransferReceivePlan {
  ok: true;
  nextStatus: "in_transit" | "accepted";
  moves: { serialNumberId: string; restoreCode: HoldCode }[];
  idempotent: boolean;
}

const APPROVABLE: readonly TransferStatus[] = ["pending_tl", "requested"];
const RELEASABLE: readonly TransferStatus[] = ["for_transfer", "approved"];

function missingPrior(serialNumberId: string): PlanFailure {
  return {
    ok: false,
    error: `Prior status was not recorded for serial ${serialNumberId}`,
  };
}

export function planTransferCreate(input: {
  fromBranchId: string;
  toBranchId: string;
  modelId: string;
  quantity: number;
  serials: readonly AllocatableSerial[];
}): TransferCreatePlan | PlanFailure {
  if (!input.fromBranchId || !input.toBranchId) {
    return { ok: false, error: "Choose the releasing and receiving branches" };
  }
  if (input.fromBranchId === input.toBranchId) {
    return { ok: false, error: "Source and receiving branch must differ" };
  }
  if (!input.modelId) {
    return { ok: false, error: "Choose a model" };
  }
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    return { ok: false, error: "Quantity must be at least 1" };
  }

  const ids = uniqueSerialIds(input.serials.map((serial) => serial.serialNumberId));
  if (!ids) {
    return { ok: false, error: "Each serial can only be selected once" };
  }
  if (ids.length === 0) {
    return { ok: false, error: "Select the serials to transfer" };
  }
  if (input.quantity !== ids.length) {
    return { ok: false, error: "Quantity must equal the number of serials selected" };
  }

  const holds: TransferCreatePlan["holds"] = [];
  for (const serial of input.serials) {
    if (serial.modelId !== input.modelId) {
      return { ok: false, error: "Every serial must be the model on this request" };
    }
    const allocation = classifyAllocation(serial);
    if (!allocation.ok) return allocation;
    holds.push({
      serialNumberId: serial.serialNumberId,
      priorCode: allocation.priorCode,
      nextCode: "RSV",
    });
  }

  return { ok: true, nextStatus: "pending_tl", holds };
}

export function planTransferApprove(input: {
  status: TransferStatus;
  lines: readonly Pick<TransferLineView, "serialNumberId" | "priorCode" | "inventoryCode">[];
}): TransferApprovePlan | PlanFailure {
  if (input.lines.length === 0) {
    return { ok: false, error: "This transfer has no serials to approve" };
  }

  if (input.status === "for_transfer") {
    const allReserved = input.lines.every((line) => line.inventoryCode === "RSV");
    if (!allReserved) {
      return { ok: false, error: "Reserved units on this transfer have changed" };
    }
    return {
      ok: true,
      nextStatus: "for_transfer",
      holds: [],
      idempotent: true,
      destinationStockAdded: false,
    };
  }

  if (!APPROVABLE.includes(input.status)) {
    return { ok: false, error: "Only a request waiting for Team Lead can be approved" };
  }

  const holds: TransferApprovePlan["holds"] = [];
  for (const line of input.lines) {
    if (line.inventoryCode === "RSV") continue;
    if (line.inventoryCode === "STK" || line.inventoryCode === "DEF") {
      holds.push({
        serialNumberId: line.serialNumberId,
        priorCode: line.priorCode ?? line.inventoryCode,
      });
      continue;
    }
    return { ok: false, error: "A serial on this transfer is no longer reserved" };
  }

  return {
    ok: true,
    nextStatus: "for_transfer",
    holds,
    idempotent: false,
    destinationStockAdded: false,
  };
}

export function planTransferReject(input: {
  status: TransferStatus;
  lines: readonly Pick<TransferLineView, "serialNumberId" | "priorCode" | "inventoryCode">[];
}): TransferRejectPlan | PlanFailure {
  if (input.status === "rejected" || input.status === "cancelled") {
    return { ok: true, nextStatus: "rejected", restores: [], idempotent: true };
  }
  if (!APPROVABLE.includes(input.status)) {
    return { ok: false, error: "Only a request waiting for Team Lead can be rejected" };
  }

  const restores: TransferRejectPlan["restores"] = [];
  for (const line of input.lines) {
    if (line.inventoryCode !== "RSV") continue;
    if (line.priorCode !== "STK" && line.priorCode !== "DEF") return missingPrior(line.serialNumberId);
    restores.push({ serialNumberId: line.serialNumberId, restoreCode: line.priorCode });
  }

  return { ok: true, nextStatus: "rejected", restores, idempotent: false };
}

export function planTransferRelease(input: {
  status: TransferStatus;
  lines: readonly Pick<TransferLineView, "serialNumberId" | "priorCode" | "inventoryCode">[];
}): TransferReleasePlan | PlanFailure {
  if (input.lines.length === 0) {
    return { ok: false, error: "This transfer has no serials to release" };
  }

  if (input.status === "in_transit") {
    const allTransit = input.lines.every((line) => line.inventoryCode === "DIT");
    if (!allTransit) {
      return { ok: false, error: "Some serials are not reserved for release" };
    }
    return { ok: true, nextStatus: "in_transit", moves: [], idempotent: true };
  }

  if (!RELEASABLE.includes(input.status)) {
    return { ok: false, error: "Release the transfer only after Team Lead approval" };
  }

  const moves: TransferReleasePlan["moves"] = [];
  for (const line of input.lines) {
    if (line.priorCode !== "STK" && line.priorCode !== "DEF") return missingPrior(line.serialNumberId);
    if (line.inventoryCode !== "RSV") {
      return { ok: false, error: "Some serials are not reserved for release" };
    }
    moves.push({ serialNumberId: line.serialNumberId });
  }

  return { ok: true, nextStatus: "in_transit", moves, idempotent: false };
}

function lineIsReceived(line: TransferLineView, toBranchId: string): boolean {
  return line.branchId === toBranchId && line.inventoryCode === line.priorCode && line.priorCode !== null;
}

export function planTransferReceive(input: {
  status: TransferStatus;
  fromBranchId: string;
  toBranchId: string;
  lines: readonly TransferLineView[];
  requestedSerialIds: readonly string[];
}): TransferReceivePlan | PlanFailure {
  if (input.lines.length === 0) {
    return { ok: false, error: "This transfer has no serials to receive" };
  }

  const requested = uniqueSerialIds(input.requestedSerialIds);
  if (!requested || requested.length === 0) {
    return { ok: false, error: "Select the serials that arrived" };
  }

  const lineById = new Map(input.lines.map((line) => [line.serialNumberId, line]));
  for (const serialNumberId of requested) {
    if (!lineById.has(serialNumberId)) {
      return { ok: false, error: "One or more serials are not on this transfer" };
    }
  }

  if (input.status === "accepted") {
    const alreadyThere = requested.every((serialNumberId) => {
      const line = lineById.get(serialNumberId);
      return line ? lineIsReceived(line, input.toBranchId) : false;
    });
    if (!alreadyThere) {
      return { ok: false, error: "This transfer is already accepted" };
    }
    return { ok: true, nextStatus: "accepted", moves: [], idempotent: true };
  }

  if (input.status !== "in_transit") {
    return { ok: false, error: "Receive the transfer only after it is in transit" };
  }

  const moves: TransferReceivePlan["moves"] = [];
  for (const serialNumberId of requested) {
    const line = lineById.get(serialNumberId);
    if (!line) {
      return { ok: false, error: "One or more serials are not on this transfer" };
    }
    if (line.priorCode !== "STK" && line.priorCode !== "DEF") return missingPrior(serialNumberId);
    if (lineIsReceived(line, input.toBranchId)) continue;
    if (line.branchId === input.fromBranchId && line.inventoryCode === "DIT") {
      moves.push({ serialNumberId, restoreCode: line.priorCode });
      continue;
    }
    return { ok: false, error: "A selected serial is not in transit from the releasing branch" };
  }

  const moving = new Set(moves.map((move) => move.serialNumberId));
  const allReceived = input.lines.every((line) => {
    if (moving.has(line.serialNumberId)) return true;
    return lineIsReceived(line, input.toBranchId);
  });

  return {
    ok: true,
    nextStatus: allReceived ? "accepted" : "in_transit",
    moves,
    idempotent: moves.length === 0,
  };
}
