/**
 * Branch pull-out rules. Finalize stops at in-transit on the source branch.
 * It does not create warehouse stock and does not mark the request completed.
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

export interface PulloutLineView {
  serialNumberId: string;
  priorCode: HoldCode | null;
  inventoryCode: InventoryCode | null;
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

export interface PulloutFinalizePlan {
  ok: true;
  nextStatus: "in_transit";
  moves: { serialNumberId: string; nextCode: "DIT" }[];
  createsWarehouseInventory: false;
  setsCompleted: false;
  idempotent: boolean;
}

const REJECTABLE: readonly PulloutStatus[] = ["pending_tl", "requested"];
const LISTABLE: readonly PulloutStatus[] = ["for_pullout", "pending_logistics"];

function missingPrior(serialNumberId: string): PlanFailure {
  return {
    ok: false,
    error: `Prior status was not recorded for serial ${serialNumberId}`,
  };
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
  lines: readonly PulloutLineView[];
}): PulloutFinalizePlan | PlanFailure {
  if (input.lines.length === 0) {
    return { ok: false, error: "This pull-out has no serials to send" };
  }

  if (input.status === "in_transit") {
    const allTransit = input.lines.every((line) => line.inventoryCode === "DIT");
    if (!allTransit) {
      return { ok: false, error: "Some serials are not ready to leave the branch" };
    }
    return {
      ok: true,
      nextStatus: "in_transit",
      moves: [],
      createsWarehouseInventory: false,
      setsCompleted: false,
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
    createsWarehouseInventory: false,
    setsCompleted: false,
    idempotent: false,
  };
}

/** Warehouse receipt of an in-transit pull-out is not implemented. */
export function planPulloutComplete(): PlanFailure {
  return {
    ok: false,
    error: "Warehouse receipt is not available yet. Units stay in transit.",
  };
}

export function pulloutSapMessage(
  job: { status: string; stub: boolean } | null,
): string {
  if (!job) return "No SAP request has been queued for this pull-out.";
  const status = job.status.replaceAll("_", " ");
  if (job.stub || job.status !== "completed") {
    return `SAP request is ${status}. It has not been posted to SAP.`;
  }
  return `SAP request is ${status}.`;
}
