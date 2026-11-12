/**
 * Branch transfer rules. A request reserves the units (RSV). Team leader approval
 * puts them in transit (DIT) and moves the row to the receiving branch, so the unit
 * leaves the releasing branch's inventory and shows as incoming at the receiver.
 * There is no Logistics release step. The receiving branch then accepts each serial
 * into its stock (STK) or rejects it back to the releasing branch as STK. The
 * releasing team leader's whole-request reject still restores the code the line stored.
 *
 * Legacy: transfers approved while Logistics still released them sit at For transfer
 * (FTR units, or RSV from before FTR existed). Release still takes those, so they are
 * not stuck. Transfers released before the row moved keep DIT on the releasing branch.
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
  nextStatus: "in_transit";
  /**
   * Every unit moves to DIT at the receiving branch. fromCode is RSV for a normal
   * request, or STK/DEF on legacy rows that were never reserved. priorCode is what
   * the line records.
   */
  moves: { serialNumberId: string; fromCode: HoldCode | "RSV"; priorCode: HoldCode }[];
  idempotent: boolean;
  destinationStockAdded: false;
}

export interface TransferRejectPlan {
  ok: true;
  nextStatus: "rejected";
  restores: { serialNumberId: string; restoreCode: HoldCode }[];
  idempotent: boolean;
}

/** Legacy release only: FTR, or RSV on transfers approved before FTR existed. */
export type TransferReleaseFromCode = "FTR" | "RSV";

export interface TransferReleasePlan {
  ok: true;
  nextStatus: "in_transit";
  moves: { serialNumberId: string; fromCode: TransferReleaseFromCode }[];
  idempotent: boolean;
}

export interface TransferReceivePlan {
  ok: true;
  nextStatus: TransferHeaderAfterLines;
  /**
   * Every decided unit becomes STK. fromCode is the hold being cleared and
   * atBranchId the branch that holds the row now (releasing or receiving).
   */
  moves: { serialNumberId: string; restoreCode: "STK"; fromCode: "RSV" | "DIT"; atBranchId: string }[];
  idempotent: boolean;
}

export type TransferHeaderAfterLines =
  | "in_transit"
  | "accepted"
  | "rejected"
  | "completed";

const APPROVABLE: readonly TransferStatus[] = ["pending_tl", "requested"];
/** Approved while Logistics still released transfers. New approvals never land here. */
const LEGACY_RELEASABLE: readonly TransferStatus[] = ["for_transfer", "approved"];

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

  // Already approved: a repeated approve only reprints the slips.
  if (input.status === "in_transit" || LEGACY_RELEASABLE.includes(input.status)) {
    return {
      ok: true,
      nextStatus: "in_transit",
      moves: [],
      idempotent: true,
      destinationStockAdded: false,
    };
  }

  if (!APPROVABLE.includes(input.status)) {
    return { ok: false, error: "Only a request waiting for Team Lead can be approved" };
  }

  const moves: TransferApprovePlan["moves"] = [];
  for (const line of input.lines) {
    if (line.inventoryCode === "RSV") {
      if (line.priorCode !== "STK" && line.priorCode !== "DEF") return missingPrior(line.serialNumberId);
      moves.push({ serialNumberId: line.serialNumberId, fromCode: "RSV", priorCode: line.priorCode });
      continue;
    }
    if (line.inventoryCode === "STK" || line.inventoryCode === "DEF") {
      moves.push({
        serialNumberId: line.serialNumberId,
        fromCode: line.inventoryCode,
        priorCode: line.priorCode ?? line.inventoryCode,
      });
      continue;
    }
    return { ok: false, error: "A serial on this transfer is no longer reserved" };
  }

  return {
    ok: true,
    nextStatus: "in_transit",
    moves,
    idempotent: false,
    destinationStockAdded: false,
  };
}

/** A legacy approval held every unit, so a held code at release means it was approved. */
function isApprovedHold(code: InventoryCode | null): code is TransferReleaseFromCode {
  return code === "FTR" || code === "RSV";
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

/** The receiving branch decides only once the transfer is in transit (after TL approval). */
const RECEIVABLE: readonly TransferStatus[] = ["in_transit"];

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
  if (pending > 0) return "in_transit";
  if (accepted > 0 && rejected > 0) return "completed";
  if (accepted > 0) return "accepted";
  if (rejected > 0) return "rejected";
  return "in_transit";
}

/** Legacy only: moves a transfer approved before TL approval sent units in transit. */
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
      return { ok: false, error: "Some serials are not approved for transfer" };
    }
    return { ok: true, nextStatus: "in_transit", moves: [], idempotent: true };
  }

  if (!LEGACY_RELEASABLE.includes(input.status)) {
    return { ok: false, error: "Only a transfer waiting for release can be released" };
  }

  const moves: TransferReleasePlan["moves"] = [];
  for (const line of pending) {
    if (line.priorCode !== "STK" && line.priorCode !== "DEF") return missingPrior(line.serialNumberId);
    if (!isApprovedHold(line.inventoryCode)) {
      return { ok: false, error: "Some serials are not approved for transfer" };
    }
    moves.push({ serialNumberId: line.serialNumberId, fromCode: line.inventoryCode });
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

/**
 * The hold a pending line clears when the receiving branch decides it, with the
 * branch holding the row. DIT sits at the receiving branch, or at the releasing
 * branch on transfers released before the row moved. RSV only remains at the
 * releasing branch, from transfers part-decided before receiving required transit.
 */
function awaitingDecision(
  line: Pick<TransferLineView, "inventoryCode" | "branchId">,
  fromBranchId: string,
  toBranchId: string,
): { fromCode: "RSV" | "DIT"; atBranchId: string } | null {
  if (!line.branchId) return null;
  if (line.inventoryCode === "DIT" && (line.branchId === fromBranchId || line.branchId === toBranchId)) {
    return { fromCode: "DIT", atBranchId: line.branchId };
  }
  if (line.inventoryCode === "RSV" && line.branchId === fromBranchId) {
    return { fromCode: "RSV", atBranchId: line.branchId };
  }
  return null;
}

/** True when the receiving branch can accept or reject this line now. */
export function lineAwaitsReceipt(input: {
  status: TransferStatus;
  fromBranchId: string;
  toBranchId: string;
  line: Pick<TransferLineView, "inventoryCode" | "branchId" | "decision">;
}): boolean {
  if (!RECEIVABLE.includes(input.status)) return false;
  if ((input.line.decision ?? "pending") !== "pending") return false;
  return awaitingDecision(input.line, input.fromBranchId, input.toBranchId) !== null;
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
    return { ok: false, error: "Accept serials only once this transfer is in transit" };
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
    const hold = awaitingDecision(line, input.fromBranchId, input.toBranchId);
    if (hold) {
      moves.push({ serialNumberId, restoreCode: "STK", ...hold });
      acceptedIds.add(serialNumberId);
      continue;
    }
    return { ok: false, error: "A selected serial is not in transit on this transfer" };
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
  toBranchId: string;
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
    return { ok: false, error: "Reject serials only once this transfer is in transit" };
  }
  const line = input.lines.find((row) => row.serialNumberId === input.serialNumberId);
  if (!line) return { ok: false, error: "That serial is not on this transfer" };
  if (line.decision === "accepted") return { ok: false, error: "This serial was already accepted" };
  if (line.decision === "rejected") {
    return { ok: true, nextStatus: headerAfterLineDecisions(input.lines), moves: [], idempotent: true };
  }
  if (line.priorCode !== "STK" && line.priorCode !== "DEF") return missingPrior(line.serialNumberId);
  const hold = awaitingDecision(line, input.fromBranchId, input.toBranchId);
  if (!hold) {
    return { ok: false, error: "This serial is not in transit on this transfer" };
  }
  const projected = input.lines.map((row) =>
    row.serialNumberId === line.serialNumberId ? { ...row, decision: "rejected" as const } : row,
  );
  return {
    ok: true,
    nextStatus: headerAfterLineDecisions(projected),
    moves: [{ serialNumberId: line.serialNumberId, restoreCode: "STK", ...hold }],
    idempotent: false,
  };
}
