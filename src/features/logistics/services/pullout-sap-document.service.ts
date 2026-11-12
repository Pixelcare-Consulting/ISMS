import {
  formatPulloutSapDoc,
  parsePulloutSapDocument,
  PULLOUT_SAP_DOC_ENTITY,
  type PulloutSapDocType,
  type PulloutSapDocument,
} from "@/features/logistics/lib/pullout-sap-document";
import { sapErrorMessage } from "@/features/sap/services/sap-master-data";
import { sapServiceLayerClient } from "@/features/sap/services/sap-service-layer-client";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";
import type { SapServiceLayerCredentials } from "@/features/sap/types/sap-service-layer";

const NOT_CONNECTED =
  "SAP is not connected, so the document cannot be checked. Ask an admin to set up the Service Layer in Settings.";

async function sapGet<T>(creds: SapServiceLayerCredentials, path: string, entity: string): Promise<T | null> {
  const response = await sapServiceLayerClient.request<T>({ creds, method: "GET", path });
  if (response.statusCode >= 400) {
    throw new Error(sapErrorMessage(response.statusCode, response.rawBody, entity));
  }
  return response.data ?? null;
}

/**
 * Reads the IT or Return a user typed by its DocNum. Throws a user-facing message when SAP
 * is not connected, has no such document, or has more than one with that number.
 */
export async function fetchPulloutSapDocument(
  tenantId: string,
  type: PulloutSapDocType,
  docNum: number,
): Promise<PulloutSapDocument> {
  const creds = await sapServiceLayerService.getCredentials(tenantId);
  if (!creds) throw new Error(NOT_CONNECTED);

  const entity = PULLOUT_SAP_DOC_ENTITY[type];
  const label = formatPulloutSapDoc(type, docNum);
  const filter = encodeURIComponent(`DocNum eq ${docNum}`);
  const listed = await sapGet<{ value?: { DocEntry?: unknown }[] }>(
    creds,
    `/${entity}?$filter=${filter}&$select=DocEntry`,
    entity,
  );
  const entries = (listed?.value ?? [])
    .map((row) => Number(row.DocEntry))
    .filter((docEntry) => Number.isInteger(docEntry));
  if (entries.length === 0) throw new Error(`SAP has no ${label}`);
  if (entries.length > 1) {
    throw new Error(`More than one document in SAP is ${label}. Ask SAP support which one to use.`);
  }

  // No $select: with one, the Service Layer leaves each line's SerialNumbers out.
  const raw = await sapGet<Record<string, unknown>>(creds, `/${entity}(${entries[0]})`, entity);
  const parsed = parsePulloutSapDocument(type, raw ?? {});
  if ("error" in parsed) throw new Error(parsed.error);
  return parsed;
}
