/**
 * Branch transfer rules. Approval holds the same branch row as reserved and
 * does not add destination stock. The receiving branch then accepts or rejects
 * each serial into stock (STK). The releasing team leader's whole-request
 * reject still restores the code the line stored.
 */

import type { TransferWorkflowCodeKey } from "@/features/logistics/constants/workflow-codes";
import {
  classifyAllocation,
  uniqueSerialIds,
  type AllocatableSerial,
  type HoldCode,
  type InventoryCode,
  type PlanFailure,
} from "@/features/logistics/services/posting-planner-types";

export type TransferStatus = TransferWorkflowCodeKey;

export type TransferLineDecision = "pending" | "accepted" | "rejected";

export interface TransferLineView {
  serialNumberId: string;
  priorCode: HoldCode | null;
  inventoryCode: InventoryCode | null;
  /** Branch that currently holds the inventory row. Null when the row is missing. */
  branchId: string | null;
  /** Receiving-branch outcome. Omitted lines are still pending. */
  decision?: TransferLineDecision;
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
  nextStatus: "for_transfer" | "in_transit" | "accepted" | "rejected" | "completed";
  /** Destination stock is always STK. fromCode is the hold being released. */
  moves: { serialNumberId: string; restoreCode: "STK"; fromCode: "RSV" | "DIT" }[];
  idempotent: boolean;
}

export type TransferHeaderAfterLines =
  | "for_transfer"
  | "in_transit"
  | "accepted"
  | "rejected"
  | "completed";

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

const RECEIVABLE: readonly TransferStatus[] = ["for_transfer", "approved", "in_transit"];

function openLines<T extends { decision?: TransferLineDecision }>(lines: readonly T[]): T[] {
  return lines.filter((line) => line.decision !== "accepted" && line.decision !== "rejected");
}

export function headerAfterLineDecisions(
  lines: readonly { decision?: TransferLineDecision }[],
): TransferHeaderAfterLines {
  let pending = 0;
  let accepted = 0;
  let rejected = 0;
  for (const line of lines) {
    const decision = line.decision ?? "pending";
    switch (decision) {
      case "accepted":
        accepted += 1;
        break;
      case "rejected":
        rejected += 1;
        break;
      case "pending":
        pending += 1;
        break;
      default: {
        const unreachable: never = decision;
        return unreachable;
      }
    }
  }
  if (pending > 0) return accepted + rejected > 0 ? "in_transit" : "for_transfer";
  if (accepted > 0 && rejected > 0) return "completed";
  if (accepted > 0) return "accepted";
  if (rejected > 0) return "rejected";
  return "for_transfer";
}

export function planTransferRelease(input: {
  status: TransferStatus;
  lines: readonly Pick<TransferLineView, "serialNumberId" | "priorCode" | "inventoryCode" | "decision">[];
}): TransferReleasePlan | PlanFailure {
  if (input.lines.length === 0) {
    return { ok: false, error: "This transfer has no serials to release" };
  }

  const pending = openLines(input.lines);
  if (pending.length === 0) {
    return { ok: false, error: "Every serial on this transfer is already accepted or rejected" };
  }

  if (input.status === "in_transit") {
    const allTransit = pending.every((line) => line.inventoryCode === "DIT");
    if (!allTransit) {
      return { ok: false, error: "Some serials are not reserved for release" };
    }
    return { ok: true, nextStatus: "in_transit", moves: [], idempotent: true };
  }

  if (!RELEASABLE.includes(input.status)) {
    return { ok: false, error: "Release the transfer only after Team Lead approval" };
  }

  const moves: TransferReleasePlan["moves"] = [];
  for (const line of pending) {
    if (line.priorCode !== "STK" && line.priorCode !== "DEF") return missingPrior(line.serialNumberId);
    if (line.inventoryCode !== "RSV") {
      return { ok: false, error: "Some serials are not reserved for release" };
    }
    moves.push({ serialNumberId: line.serialNumberId });
  }

  return { ok: true, nextStatus: "in_transit", moves, idempotent: false };
}

function lineIsAccepted(line: TransferLineView, toBranchId: string): boolean {
  if (line.decision === "accepted") return true;
  if (line.decision === "rejected") return false;
  return (
    line.branchId === toBranchId &&
    line.priorCode !== null &&
    (line.inventoryCode === "STK" || line.inventoryCode === line.priorCode)
  );
}

function holdCode(line: TransferLineView): "RSV" | "DIT" | null {
  if (line.inventoryCode === "RSV" || line.inventoryCode === "DIT") return line.inventoryCode;
  return null;
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

  if (input.status === "accepted" || input.status === "completed" || input.status === "rejected") {
    const alreadyThere = requested.every((serialNumberId) => {
      const line = lineById.get(serialNumberId);
      return line ? lineIsAccepted(line, input.toBranchId) : false;
    });
    if (!alreadyThere) {
      return { ok: false, error: "This transfer is already finished" };
    }
    return { ok: true, nextStatus: input.status === "rejected" ? "rejected" : input.status === "completed" ? "completed" : "accepted", moves: [], idempotent: true };
  }

  if (!RECEIVABLE.includes(input.status)) {
    return { ok: false, error: "Accept serials only after the releasing team leader approves" };
  }

  const moves: TransferReceivePlan["moves"] = [];
  const acceptedIds = new Set<string>();
  for (const serialNumberId of requested) {
    const line = lineById.get(serialNumberId);
    if (!line) {
      return { ok: false, error: "One or more serials are not on this transfer" };
    }
    if (line.decision === "rejected") {
      return { ok: false, error: "A selected serial was already rejected" };
    }
    if (line.priorCode !== "STK" && line.priorCode !== "DEF") return missingPrior(serialNumberId);
    if (lineIsAccepted(line, input.toBranchId)) {
      acceptedIds.add(serialNumberId);
      continue;
    }
    const fromCode = holdCode(line);
    if (line.branchId === input.fromBranchId && fromCode) {
      moves.push({ serialNumberId, restoreCode: "STK", fromCode });
      acceptedIds.add(serialNumberId);
      continue;
    }
    return { ok: false, error: "A selected serial is not waiting at the releasing branch" };
  }

  const projected = input.lines.map((line) =>
    acceptedIds.has(line.serialNumberId) ? { ...line, decision: "accepted" as const } : line,
  );

  return {
    ok: true,
    nextStatus: headerAfterLineDecisions(projected),
    moves,
    idempotent: moves.length === 0,
  };
}

export function planTransferSerialReject(input: {
  status: TransferStatus;
  fromBranchId: string;
  lines: readonly TransferLineView[];
  serialNumberId: string;
  remarks: string;
}): TransferReceivePlan | PlanFailure {
  const remarks = input.remarks.trim();
  if (!remarks) return { ok: false, error: "Say why this serial was rejected" };
  if (input.lines.length === 0) {
    return { ok: false, error: "This transfer has no serials to reject" };
  }
  if (!RECEIVABLE.includes(input.status)) {
    return { ok: false, error: "Reject serials only after the releasing team leader approves" };
  }
  const line = input.lines.find((row) => row.serialNumberId === input.serialNumberId);
  if (!line) return { ok: false, error: "That serial is not on this transfer" };
  if (line.decision === "accepted") return { ok: false, error: "This serial was already accepted" };
  if (line.decision === "rejected") {
    return { ok: true, nextStatus: headerAfterLineDecisions(input.lines), moves: [], idempotent: true };
  }
  if (line.priorCode !== "STK" && line.priorCode !== "DEF") return missingPrior(line.serialNumberId);
  const fromCode = holdCode(line);
  if (line.branchId !== input.fromBranchId || !fromCode) {
    return { ok: false, error: "This serial is not waiting at the releasing branch" };
  }
  const projected = input.lines.map((row) =>
    row.serialNumberId === line.serialNumberId ? { ...row, decision: "rejected" as const } : row,
  );
  return {
    ok: true,
    nextStatus: headerAfterLineDecisions(projected),
    moves: [{ serialNumberId: line.serialNumberId, restoreCode: "STK", fromCode }],
    idempotent: false,
  };
}
