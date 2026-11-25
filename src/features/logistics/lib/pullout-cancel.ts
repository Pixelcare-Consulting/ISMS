/**
 * Rules for cancelling a pull-out after Team Lead approval, shared by branch and service
 * center pull-outs. Pure: no SAP, no database.
 *
 * - Before Send: held units (FPO/RSV) go back to their STK or DEF. Nothing is in SAP.
 * - After Send: every IT/Return carrying the pull-out number is looked at.
 *   - IT: cancelled in SAP (an IT cannot be closed), so its units go back to STK or DEF.
 *   - Return: closed in SAP, so nothing more is copied from it. Its units stay Pulled out:
 *     closing a Return does not move stock, SAP still has them in the warehouse.
 *   - Units still In transit with no SAP document go back to STK or DEF.
 * Refused when a document also lists units outside this pull-out (SAP acts on the whole
 * document), when SAP has a document ISMS has not linked yet (run Check SAP first), or
 * when a unit was already redelivered or settled on the old receiving flow.
 */

import {
  formatPulloutSapDoc,
  samePulloutRef,
  type PulloutSapDocType,
  type PulloutSapDocument,
} from "@/features/logistics/lib/pullout-sap-document";
import type { SapDocumentAction } from "@/features/sap/services/sap-document-status";

/** Codes a pull-out unit can hold or go back to. */
type HoldCode = "STK" | "DEF";

/** Statuses a pull-out can be cancelled from, before Send and after. */
export const PULLOUT_CANCEL_BEFORE_SEND = ["approved", "for_pullout", "scheduled", "pending_logistics"] as const;
export const PULLOUT_CANCEL_AFTER_SEND = ["in_transit", "pulled_out"] as const;

export function isPulloutCancellable(status: string): boolean {
  return (
    (PULLOUT_CANCEL_BEFORE_SEND as readonly string[]).includes(status) ||
    (PULLOUT_CANCEL_AFTER_SEND as readonly string[]).includes(status)
  );
}

export function pulloutCancelNeedsSap(status: string): boolean {
  return (PULLOUT_CANCEL_AFTER_SEND as readonly string[]).includes(status);
}

export interface PulloutCancelLine {
  serialNumberId: string;
  serialNo: string;
  /** STK or DEF the unit had before the pull-out held it. */
  priorCode: HoldCode | null;
  /** Inventory code where the pull-out left from, or null when the unit is no longer there. */
  inventoryCode: string | null;
  linked: { type: PulloutSapDocType; docEntry: number | null } | null;
  redelivered: boolean;
  legacySettled: boolean;
}

export interface PulloutCancelSapAction {
  type: PulloutSapDocType;
  docEntry: number;
  docNum: number;
  action: SapDocumentAction;
}

export interface PulloutCancelPlan {
  ok: true;
  idempotent: boolean;
  /** Units going back to what they were before the pull-out, from the code they hold now. */
  restores: { serialNumberId: string; fromCode: string; restoreCode: HoldCode }[];
  /** Units on a Return: they stay Pulled out. */
  keptPulledOutIds: string[];
  /** What to do in SAP before ISMS is written, one entry per document. */
  sapActions: PulloutCancelSapAction[];
}

type PlanFailure = { ok: false; error: string };

const HELD_BEFORE_SEND = ["FPO", "RSV"];

function fail(error: string): PlanFailure {
  return { ok: false, error };
}

function serialKey(serialNo: string): string {
  return serialNo.trim().toUpperCase();
}

function docKey(type: PulloutSapDocType, docEntry: number): string {
  return `${type}:${docEntry}`;
}

function restoreOf(line: PulloutCancelLine): HoldCode | PlanFailure {
  if (line.priorCode === "STK" || line.priorCode === "DEF") return line.priorCode;
  return fail(`The status before this pull-out was not recorded for serial ${line.serialNo}`);
}

function planBeforeSend(lines: readonly PulloutCancelLine[]): PulloutCancelPlan | PlanFailure {
  const restores: PulloutCancelPlan["restores"] = [];
  for (const line of lines) {
    // A defective unit is never held: it stays DEF the whole way.
    if (line.inventoryCode !== null && line.inventoryCode === line.priorCode) continue;
    if (!line.inventoryCode || !HELD_BEFORE_SEND.includes(line.inventoryCode)) {
      return fail(`Serial ${line.serialNo} is no longer held by this pull-out`);
    }
    const restoreCode = restoreOf(line);
    if (typeof restoreCode !== "string") return restoreCode;
    restores.push({ serialNumberId: line.serialNumberId, fromCode: line.inventoryCode, restoreCode });
  }
  return { ok: true, idempotent: false, restores, keptPulledOutIds: [], sapActions: [] };
}

/** Every serial on a live document must be a unit of this pull-out already linked to it. */
function checkDocument(
  doc: PulloutSapDocument,
  pulloutNo: string,
  lineBySerial: ReadonlyMap<string, PulloutCancelLine>,
): PlanFailure | null {
  const label = formatPulloutSapDoc(doc.type, doc.docNum);
  if (doc.lines.some((line) => !samePulloutRef(line.pulloutRef, pulloutNo))) {
    return fail(
      `${label} also has rows for other pull-outs or with no pull-out number, so ISMS cannot ${doc.type === "IT" ? "cancel" : "close"} it. Handle it in SAP first.`,
    );
  }
  for (const serialNo of doc.lines.flatMap((line) => line.serialNos)) {
    const line = lineBySerial.get(serialKey(serialNo));
    if (!line) return fail(`${label} lists serial ${serialNo}, which is not on this pull-out. Handle it in SAP first.`);
    if (!line.linked || line.linked.type !== doc.type || line.linked.docEntry !== doc.docEntry) {
      return fail(`SAP shows ${label} for this pull-out, but ISMS has not linked it yet. Run Check SAP first.`);
    }
  }
  return null;
}

function planAfterSend(
  pulloutNo: string,
  lines: readonly PulloutCancelLine[],
  documents: readonly PulloutSapDocument[],
): PulloutCancelPlan | PlanFailure {
  const redelivered = lines.find((line) => line.redelivered);
  if (redelivered) {
    return fail(`Serial ${redelivered.serialNo} was already redelivered from SAP, so this pull-out cannot be cancelled.`);
  }
  const settled = lines.find((line) => line.legacySettled);
  if (settled) {
    return fail(`Serial ${settled.serialNo} was received or refused on this pull-out, so it cannot be cancelled.`);
  }

  const lineBySerial = new Map(lines.map((line) => [serialKey(line.serialNo), line]));
  const docByKey = new Map(documents.map((doc) => [docKey(doc.type, doc.docEntry), doc]));
  const live = documents.filter((doc) => !doc.cancelled);
  for (const doc of live) {
    const failure = checkDocument(doc, pulloutNo, lineBySerial);
    if (failure) return failure;
  }

  const restores: PulloutCancelPlan["restores"] = [];
  const keptPulledOutIds: string[] = [];
  const sapActions = new Map<string, PulloutCancelSapAction>();
  for (const line of lines) {
    const inventoryCode = line.inventoryCode;
    if (inventoryCode !== "DIT" && inventoryCode !== "PO") {
      return fail(`Serial ${line.serialNo} is no longer in transit or pulled out on this pull-out`);
    }
    const doc =
      line.linked && line.linked.docEntry != null
        ? docByKey.get(docKey(line.linked.type, line.linked.docEntry))
        : undefined;
    if (line.linked && !doc) {
      return fail(`The SAP document linked to serial ${line.serialNo} could not be read. Try again.`);
    }

    if (doc && !doc.cancelled && doc.type === "RETURN") {
      keptPulledOutIds.push(line.serialNumberId);
      if (!doc.closed) {
        sapActions.set(docKey(doc.type, doc.docEntry), { type: doc.type, docEntry: doc.docEntry, docNum: doc.docNum, action: "Close" });
      }
      continue;
    }
    if (doc && !doc.cancelled) {
      sapActions.set(docKey(doc.type, doc.docEntry), { type: doc.type, docEntry: doc.docEntry, docNum: doc.docNum, action: "Cancel" });
    }
    // Unlinked (still DIT), on an IT being cancelled, or on a document SAP already cancelled.
    const restoreCode = restoreOf(line);
    if (typeof restoreCode !== "string") return restoreCode;
    restores.push({ serialNumberId: line.serialNumberId, fromCode: inventoryCode, restoreCode });
  }

  return { ok: true, idempotent: false, restores, keptPulledOutIds, sapActions: [...sapActions.values()] };
}

export function planPulloutCancel(input: {
  pulloutNo: string;
  status: string;
  lines: readonly PulloutCancelLine[];
  /** Every IT/Return in SAP for this pull-out, found or linked. Required after Send. */
  documents: readonly PulloutSapDocument[] | null;
}): PulloutCancelPlan | PlanFailure {
  if (input.status === "cancelled") {
    return { ok: true, idempotent: true, restores: [], keptPulledOutIds: [], sapActions: [] };
  }
  if ((PULLOUT_CANCEL_BEFORE_SEND as readonly string[]).includes(input.status)) {
    return planBeforeSend(input.lines);
  }
  if (!pulloutCancelNeedsSap(input.status)) {
    return fail(
      input.status === "pending_tl" || input.status === "requested"
        ? "This pull-out is still waiting for Team Lead approval. Reject it instead."
        : "This pull-out can no longer be cancelled",
    );
  }
  if (input.lines.length === 0) return fail("This pull-out has no units");
  if (!input.documents) return fail("SAP must be checked before a sent pull-out is cancelled");
  return planAfterSend(input.pulloutNo, input.lines, input.documents);
}

/** Restores batched by (current code → code it goes back to), one inventory claim each. */
export function groupRestores(
  restores: PulloutCancelPlan["restores"],
): { fromCode: string; restoreCode: HoldCode; serialNumberIds: string[] }[] {
  const groups = new Map<string, { fromCode: string; restoreCode: HoldCode; serialNumberIds: string[] }>();
  for (const row of restores) {
    const key = `${row.fromCode}>${row.restoreCode}`;
    const group = groups.get(key) ?? { fromCode: row.fromCode, restoreCode: row.restoreCode, serialNumberIds: [] };
    group.serialNumberIds.push(row.serialNumberId);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** Serial log text for a cancel, naming what SAP did when it did anything. */
export function pulloutCancelHistoryText(pulloutNo: string, sapDone: readonly string[]): string {
  return sapDone.length > 0 ? `${pulloutNo} cancelled (${sapDone.join(", ")} in SAP)` : `${pulloutNo} cancelled`;
}
