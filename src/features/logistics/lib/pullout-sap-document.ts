/**
 * Rules for "Check SAP" on a sent pull-out. SAP users create the IT or Return by hand and put
 * the ISMS pull-out number in the row UDF `U_ISMS_Pullout_Number`. ISMS finds those rows,
 * links each unit to its document (DIT → PO), and follows a DR that redelivers a pulled-out
 * unit (PO → DIT at the DR's branch). Pure: no SAP, no database.
 */

export const PULLOUT_SAP_DOC_TYPES = ["IT", "RETURN"] as const;
export type PulloutSapDocType = (typeof PULLOUT_SAP_DOC_TYPES)[number];

/** Labels shown in ISMS. "IT" and "Return" match how the delivery screens name them. */
export const PULLOUT_SAP_DOC_TYPE_LABEL: Record<PulloutSapDocType, string> = {
  IT: "IT",
  RETURN: "Return",
};

/** Service Layer entity for each type. */
export const PULLOUT_SAP_DOC_ENTITY: Record<PulloutSapDocType, string> = {
  IT: "StockTransfers",
  RETURN: "Returns",
};

/** Line collection on each entity. Redeliveries are DeliveryNotes, which use DocumentLines. */
export const PULLOUT_SAP_LINES_FIELD: Record<PulloutSapDocType, "StockTransferLines" | "DocumentLines"> = {
  IT: "StockTransferLines",
  RETURN: "DocumentLines",
};

/** Row UDF (Marketing Documents → Rows) holding the ISMS pull-out number. */
export const PULLOUT_REF_UDF = "U_ISMS_Pullout_Number";

/** SAP object type of a Return, as a DR line copied from one names its base. */
export const SAP_RETURN_OBJECT_TYPE = 16;

export interface SapDocLine {
  /** `U_ISMS_Pullout_Number` on the line, trimmed. Empty when blank. */
  pulloutRef: string;
  baseType: number | null;
  baseEntry: number | null;
  /** `CostingCode2`: the branch's SAP code on marketing-document lines. Empty when blank. */
  branchCode: string;
  serialNos: string[];
}

export interface PulloutSapDocument {
  type: PulloutSapDocType;
  docEntry: number;
  docNum: number;
  /** YYYY-MM-DD, or null when SAP sent none. */
  docDate: string | null;
  cancelled: boolean;
  lines: SapDocLine[];
}

/** A DR that may bring pulled-out units back to a branch. */
export interface SapRedelivery {
  docEntry: number;
  docNum: number;
  /** What users see: the DR number (`U_DR_NUMBER`) when SAP has one, else DocNum. */
  displayNo: string;
  docDate: string | null;
  cancelled: boolean;
  lines: SapDocLine[];
}

/** "IT: 494405" or "Return: 14402". */
export function formatPulloutSapDoc(type: PulloutSapDocType, docNum: number): string {
  return `${PULLOUT_SAP_DOC_TYPE_LABEL[type]}: ${docNum}`;
}

/** Pull-out numbers as SAP users type them: compared trimmed and case-insensitive. */
export function samePulloutRef(a: string, b: string): boolean {
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

/** The pull-out number as an OData string literal (quotes doubled). */
export function pulloutRefLiteral(pulloutNo: string): string {
  return `'${pulloutNo.trim().replace(/'/g, "''")}'`;
}

function text(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function int(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number.parseInt(text(value), 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function serialKey(serialNo: string): string {
  return serialNo.trim().toUpperCase();
}

function docDateOf(raw: Record<string, unknown>): string | null {
  const value = text(raw.DocDate).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function isCancelled(raw: Record<string, unknown>): boolean {
  return raw.Cancelled === "tYES" || raw.CancelStatus === "csCancellation";
}

/** SAP sends base types as numbers on marketing documents, sometimes as names elsewhere. */
function baseTypeOf(value: unknown): number | null {
  if (value === "Returns" || value === "oReturns") return SAP_RETURN_OBJECT_TYPE;
  return int(value);
}

function parseLines(raw: unknown): SapDocLine[] {
  return ((raw as Record<string, unknown>[] | undefined) ?? []).map((line) => ({
    pulloutRef: text(line[PULLOUT_REF_UDF]),
    baseType: baseTypeOf(line.BaseType),
    baseEntry: int(line.BaseEntry),
    branchCode: text(line.CostingCode2),
    serialNos: [
      ...new Set(
        ((line.SerialNumbers as Record<string, unknown>[] | undefined) ?? [])
          .map((serial) => text(serial.InternalSerialNumber))
          .filter(Boolean),
      ),
    ],
  }));
}

/** A Service Layer StockTransfer / Return, read without $select (so lines keep their serials). */
export function parsePulloutSapDocument(
  type: PulloutSapDocType,
  raw: Record<string, unknown>,
): PulloutSapDocument | { error: string } {
  const docEntry = int(raw.DocEntry);
  const docNum = int(raw.DocNum);
  if (docEntry == null || docNum == null) return { error: "SAP document has no DocEntry/DocNum" };
  return {
    type,
    docEntry,
    docNum,
    docDate: docDateOf(raw),
    cancelled: isCancelled(raw),
    lines: parseLines(raw[PULLOUT_SAP_LINES_FIELD[type]]),
  };
}

/** A Service Layer DeliveryNote, read without $select. */
export function parseSapRedelivery(raw: Record<string, unknown>): SapRedelivery | { error: string } {
  const docEntry = int(raw.DocEntry);
  const docNum = int(raw.DocNum);
  if (docEntry == null || docNum == null) return { error: "SAP delivery has no DocEntry/DocNum" };
  return {
    docEntry,
    docNum,
    displayNo: text(raw.U_DR_NUMBER) || String(docNum),
    docDate: docDateOf(raw),
    cancelled: isCancelled(raw),
    lines: parseLines(raw.DocumentLines),
  };
}

/** What a Check SAP did, for the toast. */
export interface PulloutSapCheckResult {
  id: string;
  /** "IT: 494405" for each document newly linked. */
  linkedDocuments: string[];
  linkedCount: number;
  pulledOutCount: number;
  /** ISMS deliveries made for SAP redeliveries. */
  redeliveries: { deliveryNo: string; drNo: string; unitCount: number }[];
  /** Units SAP has not shown on an IT/Return yet. */
  waitingCount: number;
  /** Things a person should know: cancelled documents, DRs that could not be applied. */
  notes: string[];
}

// ---- Planning --------------------------------------------------------------------------

/** One unit of the pull-out as ISMS has it now. */
export interface PulloutCheckLine {
  serialNumberId: string;
  serialNo: string;
  /** Inventory code at the pull-out's branch, or null when the unit is no longer there. */
  inventoryCode: string | null;
  /** The IT/Return already linked to this unit, if any. */
  linked: { type: PulloutSapDocType; docEntry: number | null } | null;
  /** Already redelivered on an ISMS delivery. */
  redelivered: boolean;
  /** Received or refused in transit on a pull-out from before receiving was dropped. */
  legacySettled: boolean;
}

export interface PulloutLinkPlan {
  /** Units to link, grouped by the document that lists them. */
  links: { doc: PulloutSapDocument; serialNumberIds: string[] }[];
  /** Linked units (new or earlier links) still DIT: they become PO. */
  pullOutIds: string[];
  /** Units SAP has not shown on any IT/Return yet. */
  waitingSerialNos: string[];
  /** Cancelled documents carrying this pull-out number, left alone. */
  cancelledDocs: PulloutSapDocument[];
}

function byDateThenEntry<T extends { docDate: string | null; docEntry: number }>(a: T, b: T): number {
  const dateOrder = (a.docDate ?? "").localeCompare(b.docDate ?? "");
  return dateOrder !== 0 ? dateOrder : a.docEntry - b.docEntry;
}

/**
 * Which units SAP shows on an IT or Return carrying this pull-out number. Only rows whose
 * UDF names this pull-out count, since one SAP document can hold units of several pull-outs.
 * A unit on two documents takes the earliest. Units linked by hand before keep that link.
 */
export function planPulloutLinks(input: {
  pulloutNo: string;
  lines: readonly PulloutCheckLine[];
  documents: readonly PulloutSapDocument[];
}): PulloutLinkPlan {
  const live = input.documents.filter((doc) => !doc.cancelled).sort(byDateThenEntry);
  const docBySerial = new Map<string, PulloutSapDocument>();
  for (const doc of live) {
    for (const line of doc.lines) {
      if (!samePulloutRef(line.pulloutRef, input.pulloutNo)) continue;
      for (const serialNo of line.serialNos) {
        const key = serialKey(serialNo);
        if (!docBySerial.has(key)) docBySerial.set(key, doc);
      }
    }
  }

  const grouped = new Map<PulloutSapDocument, string[]>();
  const pullOutIds: string[] = [];
  const waitingSerialNos: string[] = [];
  for (const line of input.lines) {
    if (line.legacySettled || line.redelivered) continue;
    let linked = line.linked !== null;
    if (!linked) {
      const doc = docBySerial.get(serialKey(line.serialNo));
      if (doc) {
        grouped.set(doc, [...(grouped.get(doc) ?? []), line.serialNumberId]);
        linked = true;
      }
    }
    if (!linked) {
      waitingSerialNos.push(line.serialNo);
      continue;
    }
    if (line.inventoryCode === "DIT") pullOutIds.push(line.serialNumberId);
  }

  return {
    links: [...grouped].map(([doc, serialNumberIds]) => ({ doc, serialNumberIds })),
    pullOutIds,
    waitingSerialNos,
    cancelledDocs: input.documents.filter((doc) => doc.cancelled),
  };
}

export interface RedeliveryPlan {
  deliveries: { dr: SapRedelivery; branchId: string; serialNumberIds: string[] }[];
  /** DRs that relate to this pull-out but cannot be applied, with why. */
  skipped: { dr: SapRedelivery; reason: string }[];
}

/**
 * DRs that bring pulled-out units back. A DR line relates to the pull-out when it was copied
 * from one of the pull-out's Returns (SAP Copy To) or carries the pull-out number itself.
 * Only units that are PO now (or become PO in this check) and not redelivered yet move.
 * The branch is the line's `CostingCode2`; a blank one means the pull-out's own branch.
 */
export function planPulloutRedeliveries(input: {
  pulloutNo: string;
  pulloutBranchId: string;
  /** Units that are PO after the link step. */
  pulledOut: readonly { serialNumberId: string; serialNo: string }[];
  returnDocEntries: readonly number[];
  redeliveries: readonly SapRedelivery[];
  branchIdBySapCode: ReadonlyMap<string, string>;
}): RedeliveryPlan {
  const idBySerial = new Map(input.pulledOut.map((unit) => [serialKey(unit.serialNo), unit.serialNumberId]));
  const returns = new Set(input.returnDocEntries);
  const claimed = new Set<string>();
  const deliveries: RedeliveryPlan["deliveries"] = [];
  const skipped: RedeliveryPlan["skipped"] = [];

  for (const dr of [...input.redeliveries].sort(byDateThenEntry)) {
    if (dr.cancelled) continue;
    const related = dr.lines.filter(
      (line) =>
        samePulloutRef(line.pulloutRef, input.pulloutNo) ||
        (line.baseType === SAP_RETURN_OBJECT_TYPE && line.baseEntry != null && returns.has(line.baseEntry)),
    );
    const units = related.flatMap((line) =>
      line.serialNos.flatMap((serialNo) => {
        const id = idBySerial.get(serialKey(serialNo));
        return id && !claimed.has(id) ? [{ id, branchCode: line.branchCode }] : [];
      }),
    );
    if (units.length === 0) continue;

    const codes = [...new Set(units.map((unit) => unit.branchCode))];
    if (codes.length > 1) {
      skipped.push({ dr, reason: `DR ${dr.displayNo} sends these units to more than one branch` });
      continue;
    }
    const [code] = codes;
    const branchId = code ? input.branchIdBySapCode.get(code) : input.pulloutBranchId;
    if (!branchId) {
      skipped.push({ dr, reason: `DR ${dr.displayNo}: branch "${code}" is not an ISMS branch` });
      continue;
    }
    const serialNumberIds = [...new Set(units.map((unit) => unit.id))];
    for (const id of serialNumberIds) claimed.add(id);
    deliveries.push({ dr, branchId, serialNumberIds });
  }
  return { deliveries, skipped };
}
