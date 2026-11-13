import {
  PULLOUT_REF_UDF,
  PULLOUT_SAP_DOC_ENTITY,
  PULLOUT_SAP_DOC_TYPES,
  PULLOUT_SAP_LINES_FIELD,
  parsePulloutSapDocument,
  parseSapRedelivery,
  pulloutRefLiteral,
  SAP_RETURN_OBJECT_TYPE,
  type PulloutSapDocType,
  type PulloutSapDocument,
  type SapRedelivery,
} from "@/features/logistics/lib/pullout-sap-document";
import { sapErrorMessage, sapPageSize } from "@/features/sap/services/sap-master-data";
import { sapServiceLayerClient } from "@/features/sap/services/sap-service-layer-client";
import type { SapServiceLayerCredentials } from "@/features/sap/types/sap-service-layer";

/**
 * Read-only SAP lookups for "Check SAP" on a pull-out. Each search is one `$crossjoin` on the
 * document lines (FP 2405 rejects `any()` on lines), then one read per document found.
 */

/** A pull-out's documents fit in a page or two; stop well before a runaway result. */
const MAX_PAGES = 10;
/** Return DocEntries per redelivery search, so the filter stays a sane length. */
const RETURN_BATCH = 40;

const DELIVERY_ENTITY = "DeliveryNotes";

const UDF_NOT_LOADED =
  "SAP's Service Layer does not know the ISMS_Pullout_Number field yet. Ask SAP support to restart the Service Layer (it loads new UDFs on restart), then check again.";

type CrossjoinRow = Record<string, Record<string, unknown> | undefined>;

async function sapGet<T>(creds: SapServiceLayerCredentials, path: string, entity: string): Promise<T | null> {
  const response = await sapServiceLayerClient.request<T>({
    creds,
    method: "GET",
    path,
    headers: { Prefer: `odata.maxpagesize=${sapPageSize()}` },
  });
  if (response.statusCode >= 400) {
    if (response.rawBody.includes(PULLOUT_REF_UDF)) throw new Error(UDF_NOT_LOADED);
    throw new Error(sapErrorMessage(response.statusCode, response.rawBody, entity));
  }
  return response.data ?? null;
}

/** DocEntries of `entity` documents with a line matching `lineFilter`, across pages. */
async function crossjoinDocEntries(
  creds: SapServiceLayerCredentials,
  entity: string,
  linesField: string,
  lineFilter: string,
): Promise<number[]> {
  const lines = `${entity}/${linesField}`;
  const expand = `${entity}($select=DocEntry),${lines}($select=LineNum)`;
  const filter = `${entity}/DocEntry eq ${lines}/DocEntry and (${lineFilter})`;
  let path: string | null =
    `/$crossjoin(${entity},${lines})?$expand=${encodeURIComponent(expand)}&$filter=${encodeURIComponent(filter)}`;

  const entries = new Set<number>();
  for (let page = 0; path; page += 1) {
    if (page >= MAX_PAGES) throw new Error(`Stopped reading ${entity} after ${MAX_PAGES} pages`);
    const data: { value?: CrossjoinRow[]; "odata.nextLink"?: string; "@odata.nextLink"?: string } | null =
      await sapGet(creds, path, entity);
    for (const row of data?.value ?? []) {
      const docEntry = Number(row[entity]?.DocEntry);
      if (Number.isInteger(docEntry)) entries.add(docEntry);
    }
    const next: string | undefined = data?.["odata.nextLink"] ?? data?.["@odata.nextLink"];
    path = next ? `/${next.replace(/^\/+/, "")}` : null;
  }
  return [...entries];
}

/** Full document, read without $select: with one, the Service Layer drops each line's serials. */
async function readDocument(
  creds: SapServiceLayerCredentials,
  entity: string,
  docEntry: number,
): Promise<Record<string, unknown>> {
  return (await sapGet<Record<string, unknown>>(creds, `/${entity}(${docEntry})`, entity)) ?? {};
}

function refFilter(lines: string, pulloutNo: string): string {
  return `${lines}/${PULLOUT_REF_UDF} eq ${pulloutRefLiteral(pulloutNo)}`;
}

/** Every IT and Return with a row carrying this pull-out number. */
export async function findPulloutSapDocuments(
  creds: SapServiceLayerCredentials,
  pulloutNo: string,
): Promise<PulloutSapDocument[]> {
  const documents: PulloutSapDocument[] = [];
  for (const type of PULLOUT_SAP_DOC_TYPES) {
    documents.push(...(await readTypedDocuments(creds, type, pulloutNo)));
  }
  return documents;
}

async function readTypedDocuments(
  creds: SapServiceLayerCredentials,
  type: PulloutSapDocType,
  pulloutNo: string,
): Promise<PulloutSapDocument[]> {
  const entity = PULLOUT_SAP_DOC_ENTITY[type];
  const linesField = PULLOUT_SAP_LINES_FIELD[type];
  const entries = await crossjoinDocEntries(
    creds,
    entity,
    linesField,
    refFilter(`${entity}/${linesField}`, pulloutNo),
  );
  const documents: PulloutSapDocument[] = [];
  for (const docEntry of entries) {
    const parsed = parsePulloutSapDocument(type, await readDocument(creds, entity, docEntry));
    if ("error" in parsed) throw new Error(parsed.error);
    documents.push(parsed);
  }
  return documents;
}

/**
 * DRs that may redeliver this pull-out's units: a line copied from one of its Returns, or a
 * line carrying the pull-out number (Copy To carries row UDFs over).
 */
export async function findSapRedeliveries(
  creds: SapServiceLayerCredentials,
  pulloutNo: string,
  returnDocEntries: readonly number[],
): Promise<SapRedelivery[]> {
  const lines = `${DELIVERY_ENTITY}/DocumentLines`;
  const filters = [refFilter(lines, pulloutNo)];
  const uniqueReturns = [...new Set(returnDocEntries)];
  for (let i = 0; i < uniqueReturns.length; i += RETURN_BATCH) {
    const bases = uniqueReturns
      .slice(i, i + RETURN_BATCH)
      .map((entry) => `${lines}/BaseEntry eq ${entry}`)
      .join(" or ");
    filters.push(`${lines}/BaseType eq ${SAP_RETURN_OBJECT_TYPE} and (${bases})`);
  }

  const entries = new Set<number>();
  for (const filter of filters) {
    for (const entry of await crossjoinDocEntries(creds, DELIVERY_ENTITY, "DocumentLines", filter)) {
      entries.add(entry);
    }
  }

  const redeliveries: SapRedelivery[] = [];
  for (const docEntry of entries) {
    const parsed = parseSapRedelivery(await readDocument(creds, DELIVERY_ENTITY, docEntry));
    if ("error" in parsed) throw new Error(parsed.error);
    redeliveries.push(parsed);
  }
  return redeliveries;
}
