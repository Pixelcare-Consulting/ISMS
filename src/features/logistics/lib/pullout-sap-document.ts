/**
 * Rules for linking a sent pull-out unit to the SAP document a user created by hand
 * (Inventory Transfer or Return). Pure: no SAP, no database. The service fetches the
 * document and saves what this accepts.
 */

export const PULLOUT_SAP_DOC_TYPES = ["IT", "RETURN"] as const;
export type PulloutSapDocType = (typeof PULLOUT_SAP_DOC_TYPES)[number];

/** Labels shown in ISMS. "IT" and "Return" match how the delivery screens name them. */
export const PULLOUT_SAP_DOC_TYPE_LABEL: Record<PulloutSapDocType, string> = {
  IT: "IT",
  RETURN: "Return",
};

/** The SAP module users search, for the picker. */
export const PULLOUT_SAP_DOC_TYPE_DESCRIPTION: Record<PulloutSapDocType, string> = {
  IT: "Inventory Transfer",
  RETURN: "Return",
};

/** Service Layer entity for each type. */
export const PULLOUT_SAP_DOC_ENTITY: Record<PulloutSapDocType, string> = {
  IT: "StockTransfers",
  RETURN: "Returns",
};

const LINES_FIELD: Record<PulloutSapDocType, "StockTransferLines" | "DocumentLines"> = {
  IT: "StockTransferLines",
  RETURN: "DocumentLines",
};

/** SAP DocNum is a positive int4. */
const MAX_DOC_NUM = 2_147_483_647;

export interface PulloutSapDocument {
  type: PulloutSapDocType;
  docEntry: number;
  docNum: number;
  /** YYYY-MM-DD, or null when SAP sent none. */
  docDate: string | null;
  cancelled: boolean;
  serialNos: string[];
}

export function isPulloutSapDocType(value: unknown): value is PulloutSapDocType {
  return typeof value === "string" && (PULLOUT_SAP_DOC_TYPES as readonly string[]).includes(value);
}

/** "IT: 494405" or "Return: 14402". */
export function formatPulloutSapDoc(type: PulloutSapDocType, docNum: number): string {
  return `${PULLOUT_SAP_DOC_TYPE_LABEL[type]}: ${docNum}`;
}

/** Digits only, within SAP's DocNum range. */
export function parseSapDocNum(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d{1,10}$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return parsed >= 1 && parsed <= MAX_DOC_NUM ? parsed : null;
}

function text(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function int(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number.parseInt(text(value), 10);
  return Number.isInteger(parsed) ? parsed : null;
}

/** Turn a Service Layer StockTransfer / Return (read without $select) into what the link needs. */
export function parsePulloutSapDocument(
  type: PulloutSapDocType,
  raw: Record<string, unknown>,
): PulloutSapDocument | { error: string } {
  const docEntry = int(raw.DocEntry);
  const docNum = int(raw.DocNum);
  if (docEntry == null || docNum == null) return { error: "SAP document has no DocEntry/DocNum" };
  const lines = (raw[LINES_FIELD[type]] as Record<string, unknown>[] | undefined) ?? [];
  const serialNos = lines.flatMap((line) =>
    ((line.SerialNumbers as Record<string, unknown>[] | undefined) ?? [])
      .map((serial) => text(serial.InternalSerialNumber))
      .filter(Boolean),
  );
  const docDate = text(raw.DocDate).slice(0, 10);
  return {
    type,
    docEntry,
    docNum,
    docDate: /^\d{4}-\d{2}-\d{2}$/.test(docDate) ? docDate : null,
    cancelled: raw.Cancelled === "tYES" || raw.CancelStatus === "csCancellation",
    serialNos: [...new Set(serialNos)],
  };
}

function serialKey(serialNo: string): string {
  return serialNo.trim().toUpperCase();
}

/**
 * Whether the document can be linked to these units: not cancelled, and it lists every
 * serial. Serials are compared trimmed and case-insensitive, as SAP users type them.
 */
export function checkPulloutSapDocument(
  doc: PulloutSapDocument,
  serialNos: readonly string[],
): { ok: true } | { ok: false; error: string } {
  const label = formatPulloutSapDoc(doc.type, doc.docNum);
  if (doc.cancelled) return { ok: false, error: `${label} is cancelled in SAP` };
  const onDocument = new Set(doc.serialNos.map(serialKey));
  const missing = serialNos.filter((serialNo) => !onDocument.has(serialKey(serialNo)));
  if (missing.length === 0) return { ok: true };
  const shown = missing.slice(0, 3).join(", ");
  const more = missing.length > 3 ? ` and ${missing.length - 3} more` : "";
  return { ok: false, error: `${label} in SAP does not list ${shown}${more}` };
}
