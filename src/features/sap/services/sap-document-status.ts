import { SAP_DOC_ENTITY, type SapDocKind } from "@/features/sap/services/sap-documents";
import { sapErrorMessage, sapText } from "@/features/sap/services/sap-master-data";
import { sapServiceLayerClient } from "@/features/sap/services/sap-service-layer-client";
import type { SapServiceLayerCredentials } from "@/features/sap/types/sap-service-layer";

/**
 * Reads whether a SAP document is still open, and closes or cancels it. Used when a person
 * cancels an ISMS document whose ITR, SO, IT or Return already exists in SAP.
 */

export interface SapDocumentState {
  docEntry: number;
  docNum: number;
  /** Closed in SAP: by hand, or because everything on it was copied to a target document. */
  closed: boolean;
  /** Cancelled in SAP, or itself the cancellation document of another one. */
  cancelled: boolean;
}

/** `Close` ends an open ITR, SO or Return. `Cancel` reverses an IT, which SAP cannot close. */
export type SapDocumentAction = "Close" | "Cancel";

export function isSapCancelled(raw: Record<string, unknown>): boolean {
  return raw.Cancelled === "tYES" || raw.CancelStatus === "csCancellation";
}

/**
 * The whole document, no `$select`: the status fields differ between StockTransfer and
 * marketing documents, and naming one the entity lacks makes the Service Layer refuse.
 */
export async function readSapDocumentState(
  creds: SapServiceLayerCredentials,
  kind: SapDocKind,
  docEntry: number,
): Promise<SapDocumentState> {
  const entity = SAP_DOC_ENTITY[kind];
  const response = await sapServiceLayerClient.request<Record<string, unknown>>({
    creds,
    method: "GET",
    path: `/${entity}(${docEntry})`,
  });
  if (response.statusCode >= 400) {
    throw new Error(sapErrorMessage(response.statusCode, response.rawBody, entity));
  }
  const raw = response.data ?? {};
  const docNum = Number.parseInt(sapText(raw.DocNum), 10);
  if (!Number.isInteger(docNum)) throw new Error(`SAP ${entity} ${docEntry} has no DocNum`);
  const cancelled = isSapCancelled(raw);
  return { docEntry, docNum, cancelled, closed: cancelled || raw.DocumentStatus === "bost_Close" };
}

/** One Service Layer action call. SAP answers 204 with no body on success. */
export async function runSapDocumentAction(
  creds: SapServiceLayerCredentials,
  kind: SapDocKind,
  docEntry: number,
  action: SapDocumentAction,
): Promise<void> {
  const entity = SAP_DOC_ENTITY[kind];
  const response = await sapServiceLayerClient.request({
    creds,
    method: "POST",
    path: `/${entity}(${docEntry})/${action}`,
  });
  if (response.statusCode >= 400) {
    throw new Error(sapErrorMessage(response.statusCode, response.rawBody, entity));
  }
}
