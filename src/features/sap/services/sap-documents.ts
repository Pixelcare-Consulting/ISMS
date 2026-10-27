import { sapErrorMessage, sapText } from "@/features/sap/services/sap-master-data";
import { sapServiceLayerClient } from "@/features/sap/services/sap-service-layer-client";
import type { SapServiceLayerCredentials } from "@/features/sap/types/sap-service-layer";

/**
 * Builds, posts and reads back the SAP B1 Service Layer documents the ordering and
 * logistics flows emit. Builders are pure; `postSapDocument` is the only I/O.
 */

export type SapDocKind = "ITR" | "SO" | "IT" | "DR" | "RETURN";

export const SAP_DOC_ENTITY: Record<SapDocKind, string> = {
  ITR: "InventoryTransferRequests",
  SO: "Orders",
  IT: "StockTransfers",
  DR: "DeliveryNotes",
  RETURN: "Returns",
};

/** ITR and IT are both StockTransfer documents; the rest are generic Documents. */
const LINES_FIELD: Record<SapDocKind, "StockTransferLines" | "DocumentLines"> = {
  ITR: "StockTransferLines",
  IT: "StockTransferLines",
  SO: "DocumentLines",
  DR: "DocumentLines",
  RETURN: "DocumentLines",
};

/** SAP object-type codes for the base document of a copied line. */
const BASE_TYPE_SO = 17;
const BASE_TYPE_DR = 15;

export interface SapDocRef {
  docEntry: number;
  docNum: number;
  /** YYYY-MM-DD */
  docDate: string;
  /** What users see: the DR number when SAP has one, else DocNum. */
  displayNo: string;
  lineNums: number[];
}

export interface SapSerialLine {
  itemCode: string;
  serialNos: string[];
  baseEntry?: number;
  baseLine?: number;
}

interface PlainLine {
  itemCode: string;
  quantity: number;
}

/** The ISMS reference is the idempotency key: it is what the lookup in `postSapDocument` matches on. */
function header(ismsRef: string) {
  return { U_ISMS_PO_No: ismsRef, Comments: `ISMS ${ismsRef}` };
}

function serialPayload(line: SapSerialLine) {
  return {
    Quantity: line.serialNos.length,
    SerialNumbers: line.serialNos.map((s) => ({ InternalSerialNumber: s, Quantity: 1 })),
  };
}

function baseRef(line: SapSerialLine) {
  return line.baseEntry == null
    ? {}
    : { BaseEntry: line.baseEntry, BaseLine: line.baseLine ?? 0 };
}

/**
 * Column sizes in this company DB (OWTQ / WTQ1, read from UserFieldsMD on 2026-10-27,
 * Comments and JournalMemo are B1's own). A longer value makes SAP refuse the document,
 * so every free-text value is fitted before it is sent.
 */
const ITR_TEXT_LIMITS = {
  comments: 254,
  journalMemo: 50,
  lineIsmsRef: 21,
  lineBranchName: 20,
  lineBranchNameLong: 100,
} as const;

/** One line of text no longer than `max`: whitespace collapsed, cut with "…" if needed. */
export function fitSapText(value: string, max: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * An approved consignment order as an Inventory Transfer Request.
 *
 * Header: Remarks carry the order notes (the ISMS reference when there are none), and
 * Journal Remarks read `ISMS <order #> · <branch>` instead of SAP's generic default.
 * Due Date is sent only when the order has a delivery due date; without one SAP sets it.
 * Lines: the order number (ISMS PO#) and the branch name on every line, full name in
 * Branch Namelong and the 20-character Branch Name column filled as far as it fits.
 */
export function buildItrBody(i: {
  ismsRef: string;
  fromWhs: string;
  toWhs: string;
  branchName: string;
  notes?: string | null;
  /** YYYY-MM-DD. Omitted (not sent) when the order has no delivery due date. */
  dueDate?: string | null;
  lines: PlainLine[];
}): Record<string, unknown> {
  const branchName = i.branchName.trim();
  const notes = i.notes?.trim();
  return {
    ...header(i.ismsRef),
    Comments: fitSapText(notes || `ISMS ${i.ismsRef}`, ITR_TEXT_LIMITS.comments),
    JournalMemo: fitSapText(
      branchName ? `ISMS ${i.ismsRef} · ${branchName}` : `ISMS ${i.ismsRef}`,
      ITR_TEXT_LIMITS.journalMemo,
    ),
    ...(i.dueDate ? { DueDate: i.dueDate } : {}),
    FromWarehouse: i.fromWhs,
    ToWarehouse: i.toWhs,
    StockTransferLines: i.lines.map((l) => ({
      ItemCode: l.itemCode,
      Quantity: l.quantity,
      FromWarehouseCode: i.fromWhs,
      WarehouseCode: i.toWhs,
      U_ISMS_PONum: fitSapText(i.ismsRef, ITR_TEXT_LIMITS.lineIsmsRef),
      ...(branchName
        ? {
            U_Branch_Name: fitSapText(branchName, ITR_TEXT_LIMITS.lineBranchName),
            U_Branch_Namelong: fitSapText(branchName, ITR_TEXT_LIMITS.lineBranchNameLong),
          }
        : {}),
    })),
  };
}

export function buildSoBody(i: {
  ismsRef: string;
  cardCode: string;
  whs: string;
  dueDate: string;
  lines: PlainLine[];
}): Record<string, unknown> {
  return {
    ...header(i.ismsRef),
    CardCode: i.cardCode,
    DocDueDate: i.dueDate,
    DocumentLines: i.lines.map((l) => ({
      ItemCode: l.itemCode,
      Quantity: l.quantity,
      WarehouseCode: i.whs,
    })),
  };
}

export function buildItBody(i: {
  ismsRef: string;
  fromWhs: string;
  toWhs: string;
  baseItrEntry?: number;
  lines: SapSerialLine[];
}): Record<string, unknown> {
  return {
    ...header(i.ismsRef),
    FromWarehouse: i.fromWhs,
    ToWarehouse: i.toWhs,
    StockTransferLines: i.lines.map((l) => ({
      ItemCode: l.itemCode,
      FromWarehouseCode: i.fromWhs,
      WarehouseCode: i.toWhs,
      ...serialPayload(l),
      ...(l.baseEntry != null || i.baseItrEntry != null
        ? {
            BaseType: "InventoryTransferRequest",
            BaseEntry: l.baseEntry ?? i.baseItrEntry,
            BaseLine: l.baseLine ?? 0,
          }
        : {}),
    })),
  };
}

function buildBasedDocumentBody(
  ismsRef: string,
  cardCode: string,
  whs: string,
  baseType: number,
  baseEntry: number,
  lines: SapSerialLine[],
): Record<string, unknown> {
  return {
    ...header(ismsRef),
    CardCode: cardCode,
    DocumentLines: lines.map((l) => ({
      ItemCode: l.itemCode,
      WarehouseCode: whs,
      ...serialPayload(l),
      BaseType: baseType,
      ...(l.baseEntry == null ? { BaseEntry: baseEntry, BaseLine: l.baseLine ?? 0 } : baseRef(l)),
    })),
  };
}

export function buildDrBody(i: {
  ismsRef: string;
  cardCode: string;
  whs: string;
  baseSoEntry: number;
  lines: SapSerialLine[];
}): Record<string, unknown> {
  return buildBasedDocumentBody(i.ismsRef, i.cardCode, i.whs, BASE_TYPE_SO, i.baseSoEntry, i.lines);
}

export function buildReturnBody(i: {
  ismsRef: string;
  cardCode: string;
  whs: string;
  baseDrEntry: number;
  lines: SapSerialLine[];
}): Record<string, unknown> {
  return buildBasedDocumentBody(i.ismsRef, i.cardCode, i.whs, BASE_TYPE_DR, i.baseDrEntry, i.lines);
}

interface SapDocumentResponse {
  DocEntry?: number;
  DocNum?: number;
  DocDate?: string;
  U_DR_NUMBER?: string | null;
  StockTransferLines?: { LineNum: number }[];
  DocumentLines?: { LineNum: number }[];
}

/**
 * Post a document at most once per ISMS reference. A retried job (after a timeout or a
 * crash between SAP's commit and our write) finds the earlier document by
 * `U_ISMS_PO_No` and reads it back instead of creating a duplicate.
 */
export async function postSapDocument(
  creds: SapServiceLayerCredentials,
  kind: SapDocKind,
  ismsRef: string,
  body: Record<string, unknown>,
): Promise<SapDocRef> {
  const entity = SAP_DOC_ENTITY[kind];
  const linesField = LINES_FIELD[kind];

  const escaped = encodeURIComponent(ismsRef.replace(/'/g, "''"));
  const lookup = await sapServiceLayerClient.request<{ value?: { DocEntry?: number }[] }>({
    creds,
    method: "GET",
    path: `/${entity}?$filter=U_ISMS_PO_No eq '${escaped}'&$select=DocEntry`,
  });
  if (lookup.statusCode >= 400) {
    throw new Error(sapErrorMessage(lookup.statusCode, lookup.rawBody, entity));
  }

  let docEntry = lookup.data?.value?.[0]?.DocEntry;
  if (docEntry == null) {
    const created = await sapServiceLayerClient.request<{ DocEntry?: number }>({
      creds,
      method: "POST",
      path: `/${entity}`,
      body,
    });
    if (created.statusCode >= 400) {
      throw new Error(sapErrorMessage(created.statusCode, created.rawBody, entity));
    }
    docEntry = created.data?.DocEntry;
    if (docEntry == null) {
      throw new Error(`SAP ${entity} succeeded but returned no document reference`);
    }
  }

  const read = await sapServiceLayerClient.request<SapDocumentResponse>({
    creds,
    method: "GET",
    path: `/${entity}(${docEntry})?$select=DocEntry,DocNum,DocDate,U_DR_NUMBER,${linesField}`,
  });
  if (read.statusCode >= 400) {
    throw new Error(sapErrorMessage(read.statusCode, read.rawBody, entity));
  }

  const doc = read.data ?? {};
  const docNum = doc.DocNum ?? 0;
  return {
    docEntry,
    docNum,
    docDate: sapText(doc.DocDate).slice(0, 10),
    displayNo: sapText(doc.U_DR_NUMBER) || String(docNum),
    lineNums: (doc[linesField] ?? []).map((l) => l.LineNum),
  };
}
