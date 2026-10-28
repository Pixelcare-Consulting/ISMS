import type { CurrentPlacement } from "@/features/inventory/services/serial-placement";
import type { OrderSapDocType } from "@/features/orders/constants/order-sap-doc-type";

/**
 * Rules for following the documents SAP users create with Copy To from an approved
 * order: ITR → Inventory Transfer (IT), SO → Delivery (DR). Pure: no SAP, no database.
 * `sap-copy-to-follow.service.ts` fetches the documents and applies what this decides.
 */

export type FollowedDocKind = "IT" | "DR";

/** Values stored in `delivery_sap_documents.status`. */
export const SAP_FOLLOW_STATUS = {
  APPLIED: "APPLIED",
  /** Could not be applied this run; retried on later runs. */
  FAILED: "FAILED",
  /** Needs a person: cancelled in SAP, or not based on this order's ITR/SO. Not retried. */
  FLAGGED: "FLAGGED",
} as const;
export type SapFollowStatus = (typeof SAP_FOLLOW_STATUS)[keyof typeof SAP_FOLLOW_STATUS];

/** The document each order type is followed into: an ITR becomes an IT, an SO a DR. */
export const FOLLOWED_KIND_FOR_ORDER: Record<OrderSapDocType, FollowedDocKind> = {
  ITR: "IT",
  SO: "DR",
};

/** How SAP names the base document on a copied line. */
const BASE_TYPE: Record<FollowedDocKind, string | number> = {
  IT: "InventoryTransferRequest",
  DR: 17,
};

export interface FollowedLine {
  itemCode: string;
  /** True when the line was copied from the order's kind of base document (ITR / SO). */
  basedOnOrderDoc: boolean;
  baseEntry: number | null;
  serialNos: string[];
}

export interface FollowedDocument {
  kind: FollowedDocKind;
  docEntry: number;
  docNum: number;
  /** YYYY-MM-DD, or null when SAP sent none. */
  docDate: string | null;
  /** What users see: the DR number when SAP has one, else DocNum. */
  displayNo: string;
  /** Header `U_ISMS_PO_No`: the ISMS order number, copied over from the ITR / SO. */
  ismsRef: string;
  /** Cancelled, or itself a cancellation document (DRs only; ITs carry no such flag). */
  cancelled: boolean;
  /** IT target warehouse, so the serial's SAP warehouse link can follow it. */
  toWarehouse: string | null;
  lines: FollowedLine[];
}

function text(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function int(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number.parseInt(text(value), 10);
  return Number.isInteger(parsed) ? parsed : null;
}

/** Turn a Service Layer StockTransfer / DeliveryNote into the fields the follow-up uses. */
export function parseFollowedDocument(
  kind: FollowedDocKind,
  raw: Record<string, unknown>,
): FollowedDocument | { error: string } {
  const docEntry = int(raw.DocEntry);
  const docNum = int(raw.DocNum);
  if (docEntry == null || docNum == null) return { error: "SAP document has no DocEntry/DocNum" };

  const rawLines = (kind === "IT" ? raw.StockTransferLines : raw.DocumentLines) as
    | Record<string, unknown>[]
    | undefined;
  const lines: FollowedLine[] = (rawLines ?? []).map((line) => ({
    itemCode: text(line.ItemCode),
    basedOnOrderDoc: line.BaseType === BASE_TYPE[kind] || text(line.BaseType) === String(BASE_TYPE[kind]),
    baseEntry: int(line.BaseEntry),
    serialNos: ((line.SerialNumbers as Record<string, unknown>[] | undefined) ?? [])
      .map((serial) => text(serial.InternalSerialNumber))
      .filter(Boolean),
  }));

  const drNumber = kind === "DR" ? text(raw.U_DR_NUMBER) : "";
  const docDate = text(raw.DocDate).slice(0, 10);
  return {
    kind,
    docEntry,
    docNum,
    docDate: /^\d{4}-\d{2}-\d{2}$/.test(docDate) ? docDate : null,
    displayNo: drNumber || String(docNum),
    ismsRef: text(raw.U_ISMS_PO_No),
    cancelled: raw.Cancelled === "tYES" || raw.CancelStatus === "csCancellation",
    toWarehouse: kind === "IT" ? text(raw.ToWarehouse) || null : null,
    lines,
  };
}

export type FollowCheck =
  | { ok: true; serialNos: string[] }
  | { ok: false; status: typeof SAP_FOLLOW_STATUS.FLAGGED; reason: string };

/**
 * Whether a document really is this order's Copy To: the right kind, not cancelled,
 * every line based on the order's own ITR / SO, and at least one serial. Anything else
 * is flagged for a person rather than guessed at.
 */
export function checkFollowedDocument(
  doc: FollowedDocument,
  order: { sapDocType: OrderSapDocType; sapDocEntry: number },
): FollowCheck {
  const flag = (reason: string): FollowCheck => ({
    ok: false,
    status: SAP_FOLLOW_STATUS.FLAGGED,
    reason,
  });
  if (doc.kind !== FOLLOWED_KIND_FOR_ORDER[order.sapDocType]) {
    return flag(`An ${order.sapDocType} order is followed by a ${FOLLOWED_KIND_FOR_ORDER[order.sapDocType]}, not a ${doc.kind}`);
  }
  if (doc.cancelled) return flag(`${doc.kind} ${doc.displayNo} is cancelled in SAP`);
  if (doc.lines.length === 0) return flag(`${doc.kind} ${doc.displayNo} has no lines`);
  const foreign = doc.lines.find(
    (line) => !line.basedOnOrderDoc || line.baseEntry !== order.sapDocEntry,
  );
  if (foreign) {
    return flag(
      `${doc.kind} ${doc.displayNo} has a line (${foreign.itemCode || "no item"}) that is not copied from this order's ${order.sapDocType}`,
    );
  }
  const serialNos = [...new Set(doc.lines.flatMap((line) => line.serialNos))];
  if (serialNos.length === 0) return flag(`${doc.kind} ${doc.displayNo} lists no serial numbers`);
  return { ok: true, serialNos };
}

/**
 * Delivery status once a Copy To document lands on it. The first document dispatches
 * the delivery; a later one (partial copies) adds DIT units, so a fully accepted
 * delivery goes back to partly accepted. A rejected delivery is not reopened.
 */
export function deliveryStatusAfterFollow(
  current: string,
): "pending" | "partial" | null {
  switch (current) {
    case "approved":
    case "pending":
      return "pending";
    case "partial":
    case "accepted":
      return "partial";
    default:
      return null;
  }
}

/**
 * Which current placement rows the dispatch replaces for one serial. SAP is the source
 * of truth: the serial left the source warehouse, so a warehouse row, or a branch STK
 * row (the serial sync's own stock row), is replaced. Anything else (sold, defective,
 * in transit, at a service center) means ISMS disagrees with SAP and stops the document.
 */
export function placementsToReplace(
  placements: readonly CurrentPlacement[],
): { replaceIds: string[]; blocked: CurrentPlacement[] } {
  const replaceIds: string[] = [];
  const blocked: CurrentPlacement[] = [];
  for (const row of placements) {
    if (row.table === "warehouse" || (row.table === "branch" && row.statusCode === "STK")) {
      replaceIds.push(row.id);
    } else {
      blocked.push(row);
    }
  }
  return { replaceIds, blocked };
}
