import type { OrderSapDocType } from "@/features/orders/constants/order-sap-doc-type";
import { findDeliveryNotesBySalesOrder } from "@/features/orders/services/sap-sales-order-import.service";
import { SAP_DOC_ENTITY } from "@/features/sap/services/sap-documents";
import {
  isSapCancelled,
  readSapDocumentState,
  runSapDocumentAction,
} from "@/features/sap/services/sap-document-status";
import { sapErrorMessage, sapText } from "@/features/sap/services/sap-master-data";
import { sapServiceLayerClient } from "@/features/sap/services/sap-service-layer-client";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";
import type { SapServiceLayerCredentials } from "@/features/sap/types/sap-service-layer";
import { logger } from "@/lib/shared/logger";

/**
 * Cancelling an approved order (branch or service center) closes the ITR or SO ISMS posted
 * for it. Refused once SAP users copied any of it (ITR → IT, SO → DR): those units are
 * already on their way, so the order has to finish or be handled in SAP.
 */

const NOT_CONNECTED =
  "SAP is not connected, so the order's SAP document cannot be closed. Ask an admin to set up the Service Layer in Settings.";

/** The document a Copy To from each order document makes. */
const COPY_TARGET = { ITR: "IT", SO: "DR" } as const;

export interface OrderSapDocument {
  type: OrderSapDocType;
  docEntry: number;
  /** ISMS order number, which Copy To carries to the IT/DR header as `U_ISMS_PO_No`. */
  orderNumber: string;
}

export interface OrderSapCloseResult {
  docNum: number;
  /** False when SAP already had it closed or cancelled, so nothing was sent. */
  closedNow: boolean;
}

async function readRaw(
  creds: SapServiceLayerCredentials,
  entity: string,
  path: string,
): Promise<Record<string, unknown> | null> {
  const response = await sapServiceLayerClient.request<Record<string, unknown>>({ creds, method: "GET", path });
  if (response.statusCode >= 400) {
    throw new Error(sapErrorMessage(response.statusCode, response.rawBody, entity));
  }
  return response.data ?? null;
}

/** DocEntries of IT/DR documents whose header carries this ISMS order number. */
async function entriesByOrderNumber(
  creds: SapServiceLayerCredentials,
  entity: string,
  orderNumber: string,
): Promise<number[]> {
  const filter = encodeURIComponent(`U_ISMS_PO_No eq '${orderNumber.replace(/'/g, "''")}'`);
  const data = await readRaw(creds, entity, `/${entity}?$filter=${filter}&$select=DocEntry`);
  const rows = (data?.value as Record<string, unknown>[] | undefined) ?? [];
  return rows.map((row) => Number(row.DocEntry)).filter(Number.isInteger);
}

/**
 * DocNums of the IT/DR documents copied from this order's ITR/SO that still stand. Found by
 * the order number Copy To carries, and for an SO also by the DR lines' base document.
 * Cancelled copies (and their cancellation documents) are left out: SAP reopens the base.
 */
async function liveCopies(creds: SapServiceLayerCredentials, doc: OrderSapDocument): Promise<number[]> {
  const targetKind = COPY_TARGET[doc.type];
  const entity = SAP_DOC_ENTITY[targetKind];
  const entries = new Set(await entriesByOrderNumber(creds, entity, doc.orderNumber));
  if (doc.type === "SO") {
    const byOrder = await findDeliveryNotesBySalesOrder(creds, [doc.docEntry]);
    for (const entry of byOrder.get(doc.docEntry) ?? []) entries.add(entry);
  }

  const docNums: number[] = [];
  for (const entry of entries) {
    const raw = (await readRaw(creds, entity, `/${entity}(${entry})`)) ?? {};
    if (isSapCancelled(raw)) continue;
    docNums.push(Number.parseInt(sapText(raw.DocNum), 10) || entry);
  }
  return docNums;
}

export async function closeOrderSapDocument(
  tenantId: string,
  doc: OrderSapDocument,
): Promise<OrderSapCloseResult> {
  const creds = await sapServiceLayerService.getCredentials(tenantId);
  if (!creds) throw new Error(NOT_CONNECTED);

  const state = await readSapDocumentState(creds, doc.type, doc.docEntry);
  const copies = await liveCopies(creds, doc);
  if (copies.length > 0) {
    const target = COPY_TARGET[doc.type];
    throw new Error(
      `${doc.type} ${state.docNum} was already copied to ${target} ${copies.join(", ")} in SAP, so the order cannot be cancelled. Let the delivery finish, or cancel the ${target} in SAP first.`,
    );
  }
  if (state.closed) return { docNum: state.docNum, closedNow: false };

  await runSapDocumentAction(creds, doc.type, doc.docEntry, "Close");
  logger.info(
    { tenantId, type: doc.type, docEntry: doc.docEntry, docNum: state.docNum, orderNumber: doc.orderNumber },
    "approved order cancelled: SAP document closed",
  );
  return { docNum: state.docNum, closedNow: true };
}
