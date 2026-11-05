/**
 * Branch pull-out rules. Finalize stops at in-transit on the source branch.
 * Pull-outs are ISMS only: nothing here posts to SAP. See `planPulloutReceive`.
 */

import type { PulloutWorkflowCodeKey } from "@/features/logistics/constants/workflow-codes";
import {
  classifyAllocation,
  uniqueSerialIds,
  type AllocatableSerial,
  type HoldCode,
  type InventoryCode,
  type PlanFailure,
} from "@/features/logistics/services/posting-planner-types";

export type PulloutStatus = PulloutWorkflowCodeKey;

/** Read from the lines. Each unit keeps its own STK or DEF, so one pull-out can hold both. */
export type PulloutConditionView = HoldCode | "Mixed";

export const PULLOUT_LINE_DECISION = { pending: "pending", accepted: "accepted" } as const;

/** Matches SAP's row Remarks column, as on delivery returns. */
export const PULLOUT_LINE_REMARKS_MAX = 30;

export const PULLOUT_REJECTION_REMARKS_MAX = 200;

/** The `pullout_reason` code every defective unit carries. Stock units pick from the others. */
export const PULLOUT_DEFECTIVE_REASON_CODE = "DEF";

export interface PulloutLineView {
  serialNumberId: string;
  priorCode: HoldCode | null;
  inventoryCode: InventoryCode | null;
}

export interface PulloutDecisionLineView extends PulloutLineView {
  decision: string;
}

export interface PulloutCreatePlan {
  ok: true;
  nextStatus: "pending_tl";
  lines: { serialNumberId: string; priorCode: HoldCode; nextCode: "RSV" | "DEF" }[];
}

export interface PulloutApprovePlan {
  ok: true;
  nextStatus: "for_pullout";
  moves: { serialNumberId: string; nextCode: "FPO" }[];
  idempotent: boolean;
}

export interface PulloutRejectPlan {
  ok: true;
  nextStatus: "cancelled";
  restores: { serialNumberId: string; restoreCode: HoldCode }[];
  idempotent: boolean;
}

export interface PulloutListPlan {
  ok: true;
  nextStatus: "pending_logistics";
  restores: { serialNumberId: string; restoreCode: HoldCode }[];
  holds: { serialNumberId: string; priorCode: HoldCode; nextCode: "FPO" | "DEF" }[];
}

export interface PulloutLineApprovePlan {
  ok: true;
  idempotent: boolean;
  /** Every unit is now approved, so the pull-out moves to For pull-out. */
  completesApproval: boolean;
}

export interface PulloutLineDeletePlan {
  ok: true;
  /** Null when the unit is defective: it never left DEF, so there is no hold to release. */
  restore: { serialNumberId: string; restoreCode: HoldCode } | null;
  completesApproval: boolean;
}

export interface PulloutFinalizePlan {
  ok: true;
  nextStatus: "in_transit";
  moves: { serialNumberId: string; nextCode: "DIT" }[];
  idempotent: boolean;
}

export interface PulloutReceiptLineView extends PulloutLineView {
  received: boolean;
  rejected: boolean;
}

export interface PulloutReceipt {
  serialNumberId: string;
  warehouseLocationId: string;
}

export interface PulloutReceivePlan {
  ok: true;
  /** `priorCode` is the unit's original STK or DEF, which it keeps in the warehouse. */
  lines: { serialNumberId: string; priorCode: HoldCode; warehouseLocationId: string }[];
  completes: boolean;
}

export interface PulloutLineRejectPlan {
  ok: true;
  serialNumberId: string;
  restoreCode: HoldCode;
  /** Set when this was the last open unit. Nothing received means nothing arrived. */
  closesAs: "completed" | "cancelled" | null;
}

const REJECTABLE: readonly PulloutStatus[] = ["pending_tl", "requested"];
const LISTABLE: readonly PulloutStatus[] = ["for_pullout", "pending_logistics"];

function missingPrior(serialNumberId: string): PlanFailure {
  return {
    ok: false,
    error: `Prior status was not recorded for serial ${serialNumberId}`,
  };
}

/** STK or DEF from what the lines started as. Null when no line recorded it. */
export function pulloutCondition(
  lines: readonly { priorCode: string | null }[],
): PulloutConditionView | null {
  const stock = lines.some((line) => line.priorCode === "STK");
  const defective = lines.some((line) => line.priorCode === "DEF");
  if (stock && defective) return "Mixed";
  if (stock) return "STK";
  if (defective) return "DEF";
  return null;
}

/** Classification describes stock units only, so a unit's own status decides if it needs one. */
export function pulloutClassificationError(
  priorCode: HoldCode,
  classificationCount: number,
): string | null {
  if (priorCode === "STK") {
    return classificationCount > 0 ? null : "Choose a classification for every STK unit";
  }
  return classificationCount > 0 ? "Defective units have no classification" : null;
}

/** A stock unit gives a reason. A defective unit's reason is fixed, so it names the problem. */
export function pulloutReasonError(
  priorCode: HoldCode,
  reasonChosen: boolean,
  problemCount: number,
): string | null {
  if (priorCode === "STK") {
    if (!reasonChosen) return "Choose a reason for every STK unit";
    return problemCount > 0 ? "Stock units have no problem description" : null;
  }
  if (reasonChosen) return "Defective units are always pulled out as defective";
  return problemCount > 0 ? null : "Choose a problem description for every DEF unit";
}

/**
 * The warehouse that supplies a branch takes its units back. Same rule as order routing
 * (`resolveOrderSapRouting`), and a deleted primary warehouse counts as none.
 */
export function pulloutDestination<T extends { deletedAt: Date | null }>(
  primary: T | null,
  main: T | null,
): T | null {
  return primary && primary.deletedAt === null ? primary : main;
}

export function planPulloutCreate(input: {
  branchId: string;
  warehouseId: string;
  serials: readonly AllocatableSerial[];
}): PulloutCreatePlan | PlanFailure {
  if (!input.branchId) return { ok: false, error: "Choose a branch" };
  if (!input.warehouseId) return { ok: false, error: "Choose a warehouse" };

  const ids = uniqueSerialIds(input.serials.map((serial) => serial.serialNumberId));
  if (!ids) return { ok: false, error: "Each serial can only be selected once" };
  if (ids.length === 0) return { ok: false, error: "Select the serials to pull out" };

  const lines: PulloutCreatePlan["lines"] = [];
  for (const serial of input.serials) {
    const allocation = classifyAllocation(serial);
    if (!allocation.ok) return allocation;
    lines.push({
      serialNumberId: serial.serialNumberId,
      priorCode: allocation.priorCode,
      nextCode: allocation.priorCode === "DEF" ? "DEF" : "RSV",
    });
  }

  return { ok: true, nextStatus: "pending_tl", lines };
}

export function planPulloutApprove(input: {
  status: PulloutStatus;
  lines: readonly PulloutLineView[];
}): PulloutApprovePlan | PlanFailure {
  if (input.lines.length === 0) {
    return { ok: false, error: "This pull-out has no serials to approve" };
  }

  if (input.status === "for_pullout") {
    const settled = input.lines.every(
      (line) => line.inventoryCode === "FPO" || line.inventoryCode === "DEF",
    );
    if (!settled) {
      return { ok: false, error: "Units on this pull-out are not ready for approval" };
    }
    return { ok: true, nextStatus: "for_pullout", moves: [], idempotent: true };
  }

  if (input.status !== "pending_tl") {
    return { ok: false, error: "Only a reserve pull-out can be approved" };
  }

  const moves: PulloutApprovePlan["moves"] = [];
  for (const line of input.lines) {
    if (line.inventoryCode === "DEF") {
      if (line.priorCode !== "DEF") return missingPrior(line.serialNumberId);
      continue;
    }
    if (line.inventoryCode === "RSV") {
      moves.push({ serialNumberId: line.serialNumberId, nextCode: "FPO" });
      continue;
    }
    return { ok: false, error: "A serial on this pull-out is not reserved" };
  }

  return { ok: true, nextStatus: "for_pullout", moves, idempotent: false };
}

function reserveLine<T extends PulloutDecisionLineView>(input: {
  status: PulloutStatus;
  lines: readonly T[];
  serialNumberId: string;
}): { ok: true; line: T } | PlanFailure {
  if (input.status !== "pending_tl") {
    return { ok: false, error: "Units can only be approved or deleted while the pull-out is on reserve" };
  }
  const line = input.lines.find((row) => row.serialNumberId === input.serialNumberId);
  if (!line) return { ok: false, error: "This serial is not on this pull-out" };
  return { ok: true, line };
}

function othersApproved(
  lines: readonly PulloutDecisionLineView[],
  serialNumberId: string,
): boolean {
  return lines
    .filter((line) => line.serialNumberId !== serialNumberId)
    .every((line) => line.decision === PULLOUT_LINE_DECISION.accepted);
}

export function planPulloutLineApprove(input: {
  status: PulloutStatus;
  lines: readonly PulloutDecisionLineView[];
  serialNumberId: string;
}): PulloutLineApprovePlan | PlanFailure {
  const found = reserveLine(input);
  if (!found.ok) return found;
  if (found.line.decision === PULLOUT_LINE_DECISION.accepted) {
    return { ok: true, idempotent: true, completesApproval: false };
  }
  return {
    ok: true,
    idempotent: false,
    completesApproval: othersApproved(input.lines, input.serialNumberId),
  };
}

export function planPulloutLineDelete(input: {
  status: PulloutStatus;
  lines: readonly PulloutDecisionLineView[];
  serialNumberId: string;
}): PulloutLineDeletePlan | PlanFailure {
  const found = reserveLine(input);
  if (!found.ok) return found;
  if (input.lines.length === 1) {
    return { ok: false, error: "This is the last unit. Reject the pull-out instead." };
  }
  const { line } = found;
  if (line.priorCode !== "STK" && line.priorCode !== "DEF") return missingPrior(line.serialNumberId);
  const held = line.inventoryCode === "RSV";
  if (!held && !(line.inventoryCode === "DEF" && line.priorCode === "DEF")) {
    return { ok: false, error: "A deleted serial is not held by this pull-out" };
  }
  return {
    ok: true,
    restore: held ? { serialNumberId: line.serialNumberId, restoreCode: line.priorCode } : null,
    completesApproval: othersApproved(input.lines, input.serialNumberId),
  };
}

export function planPulloutReject(input: {
  status: PulloutStatus;
  lines: readonly PulloutLineView[];
}): PulloutRejectPlan | PlanFailure {
  if (input.status === "cancelled") {
    return { ok: true, nextStatus: "cancelled", restores: [], idempotent: true };
  }
  if (!REJECTABLE.includes(input.status)) {
    return { ok: false, error: "Only a reserve pull-out can be rejected" };
  }

  const restores: PulloutRejectPlan["restores"] = [];
  for (const line of input.lines) {
    if (line.inventoryCode === "DEF" && line.priorCode === "DEF") continue;
    if (line.inventoryCode !== "RSV") continue;
    if (line.priorCode !== "STK" && line.priorCode !== "DEF") return missingPrior(line.serialNumberId);
    restores.push({ serialNumberId: line.serialNumberId, restoreCode: line.priorCode });
  }

  return { ok: true, nextStatus: "cancelled", restores, idempotent: false };
}

function keptIsStable(line: PulloutLineView): PlanFailure | null {
  if (line.inventoryCode === "FPO" || line.inventoryCode === "DEF") return null;
  return { ok: false, error: "Listed units must stay for pull-out or defective until they leave" };
}

export function planPulloutUpdateList(input: {
  status: PulloutStatus;
  kept: readonly PulloutLineView[];
  removed: readonly PulloutLineView[];
  added: readonly AllocatableSerial[];
}): PulloutListPlan | PlanFailure {
  if (!LISTABLE.includes(input.status)) {
    return { ok: false, error: "Save the pull-out list only after Team Lead approval" };
  }
  if (input.kept.length + input.added.length === 0) {
    return { ok: false, error: "Select the serials to pull out" };
  }

  const restores: PulloutListPlan["restores"] = [];
  for (const line of input.removed) {
    if (line.priorCode !== "STK" && line.priorCode !== "DEF") return missingPrior(line.serialNumberId);
    if (line.inventoryCode === line.priorCode) continue;
    if (line.inventoryCode !== "FPO" && line.inventoryCode !== "RSV" && line.inventoryCode !== "DEF") {
      return { ok: false, error: "A removed serial is not held by this pull-out" };
    }
    restores.push({ serialNumberId: line.serialNumberId, restoreCode: line.priorCode });
  }

  for (const line of input.kept) {
    const stable = keptIsStable(line);
    if (stable) return stable;
  }

  const holds: PulloutListPlan["holds"] = [];
  for (const serial of input.added) {
    const allocation = classifyAllocation(serial);
    if (!allocation.ok) return allocation;
    holds.push({
      serialNumberId: serial.serialNumberId,
      priorCode: allocation.priorCode,
      nextCode: allocation.priorCode === "DEF" ? "DEF" : "FPO",
    });
  }

  return { ok: true, nextStatus: "pending_logistics", restores, holds };
}

export function planPulloutFinalize(input: {
  status: PulloutStatus;
  lines: readonly (PulloutLineView & { received?: boolean; rejected?: boolean })[];
}): PulloutFinalizePlan | PlanFailure {
  if (input.lines.length === 0) {
    return { ok: false, error: "This pull-out has no serials to send" };
  }

  if (input.status === "in_transit") {
    const allTransit = input.lines.every(
      (line) => line.received || line.rejected || line.inventoryCode === "DIT",
    );
    if (!allTransit) {
      return { ok: false, error: "Some serials are not ready to leave the branch" };
    }
    return {
      ok: true,
      nextStatus: "in_transit",
      moves: [],
      idempotent: true,
    };
  }

  if (input.status !== "pending_logistics") {
    return { ok: false, error: "Send the pull-out only after the logistics list is saved" };
  }

  const moves: PulloutFinalizePlan["moves"] = [];
  for (const line of input.lines) {
    if (line.priorCode !== "STK" && line.priorCode !== "DEF") return missingPrior(line.serialNumberId);
    if (line.inventoryCode !== "FPO" && line.inventoryCode !== "DEF") {
      return { ok: false, error: "Some serials are not ready to leave the branch" };
    }
    moves.push({ serialNumberId: line.serialNumberId, nextCode: "DIT" });
  }

  return {
    ok: true,
    nextStatus: "in_transit",
    moves,
    idempotent: false,
  };
}

/** Still waiting on the warehouse: neither received nor rejected. */
function awaitingReceipt(line: PulloutReceiptLineView): boolean {
  return !line.received && !line.rejected;
}

/**
 * Receives the units that arrived. A pull-out can arrive in parts: the rest stay in transit
 * and the pull-out completes on the last unit. Pull-outs do not post to SAP.
 */
export function planPulloutReceive(input: {
  status: PulloutStatus;
  lines: readonly PulloutReceiptLineView[];
  receipts: readonly PulloutReceipt[];
}): PulloutReceivePlan | PlanFailure {
  if (input.status !== "in_transit") {
    return { ok: false, error: "Only an in-transit pull-out can be received" };
  }
  if (input.receipts.length === 0) return { ok: false, error: "Select the units that arrived" };
  if (!uniqueSerialIds(input.receipts.map((receipt) => receipt.serialNumberId))) {
    return { ok: false, error: "Each serial can only be received once" };
  }

  const lineBySerial = new Map(input.lines.map((line) => [line.serialNumberId, line]));
  const lines: PulloutReceivePlan["lines"] = [];
  for (const receipt of input.receipts) {
    const line = lineBySerial.get(receipt.serialNumberId);
    if (!line) return { ok: false, error: "A selected serial is not on this pull-out" };
    if (line.received) return { ok: false, error: "A selected unit was already received" };
    if (line.rejected) return { ok: false, error: "A selected unit was rejected" };
    if (!receipt.warehouseLocationId) {
      return { ok: false, error: "Choose a warehouse location for every unit" };
    }
    if (line.priorCode !== "STK" && line.priorCode !== "DEF") {
      return missingPrior(line.serialNumberId);
    }
    if (line.inventoryCode !== "DIT") {
      return { ok: false, error: "Some units are no longer in transit at the branch" };
    }
    lines.push({
      serialNumberId: line.serialNumberId,
      priorCode: line.priorCode,
      warehouseLocationId: receipt.warehouseLocationId,
    });
  }

  const awaiting = input.lines.filter(awaitingReceipt).length;
  return { ok: true, lines, completes: lines.length === awaiting };
}

/**
 * Refuses one in-transit unit that did not arrive or cannot be accepted. It goes back to the
 * branch as its original STK or DEF, which is also where SAP still has it. A unit that is
 * really lost then shows as missing on the branch's stock count.
 */
export function planPulloutLineReject(input: {
  status: PulloutStatus;
  lines: readonly PulloutReceiptLineView[];
  serialNumberId: string;
  remarks: string;
}): PulloutLineRejectPlan | PlanFailure {
  if (input.status !== "in_transit") {
    return { ok: false, error: "Only an in-transit unit can be rejected" };
  }
  if (!input.remarks.trim()) {
    return { ok: false, error: "Enter the reason for rejecting this unit" };
  }
  const line = input.lines.find((row) => row.serialNumberId === input.serialNumberId);
  if (!line) return { ok: false, error: "This serial is not on this pull-out" };
  if (line.received) return { ok: false, error: "This unit was already received" };
  if (line.rejected) return { ok: false, error: "This unit was already rejected" };
  if (line.priorCode !== "STK" && line.priorCode !== "DEF") {
    return missingPrior(line.serialNumberId);
  }
  if (line.inventoryCode !== "DIT") {
    return { ok: false, error: "This unit is no longer in transit at the branch" };
  }

  const othersAwaiting = input.lines.some(
    (row) => row.serialNumberId !== input.serialNumberId && awaitingReceipt(row),
  );
  const anyReceived = input.lines.some((row) => row.received);
  return {
    ok: true,
    serialNumberId: line.serialNumberId,
    restoreCode: line.priorCode,
    closesAs: othersAwaiting ? null : anyReceived ? "completed" : "cancelled",
  };
}

/**
 * The warehouse's default location, else where the unit was before, else the only location
 * there is. Otherwise the receiver picks.
 */
export function defaultReceiveLocation(
  recordedLocationId: string | null,
  locations: readonly { id: string; isDefault: boolean }[],
): string {
  const preset =
    locations.find((location) => location.isDefault) ??
    locations.find((location) => location.id === recordedLocationId);
  if (preset) return preset.id;
  return locations.length === 1 ? (locations[0]?.id ?? "") : "";
}
