import { sapErrorMessage, sapPageSize, sapText } from "@/features/sap/services/sap-master-data";
import {
  sapServiceLayerClient,
  type SapServiceLayerRequestResult,
} from "@/features/sap/services/sap-service-layer-client";
import type { SapServiceLayerCredentials } from "@/features/sap/types/sap-service-layer";

/**
 * Where SAP holds the serials a serial-sync page just read.
 *
 * `SerialNumberDetails` (OSRN) says which item a serial belongs to but not where it is.
 * Location lives in OSRQ (serial quantity per warehouse), which the Service Layer exposes
 * through no entity, so it is read through a saved query ISMS creates in the company DB
 * the first time it needs it (`ensureSapOnHandQuery`):
 *
 *   SELECT T1.AbsEntry, T1.DistNumber, T0.ItemCode, T0.WhsCode FROM OSRQ T0
 *   INNER JOIN OSRN T1 ON T1.ItemCode = T0.ItemCode AND T1.SysNumber = T0.SysNumber
 *   WHERE T1.AbsEntry > :lo AND T1.AbsEntry <= :hi AND T0.Quantity > 0
 *
 * Keyed by serial id because that is how the serial sync pages: `SerialNumberDetails`'
 * `DocEntry` *is* OSRN.AbsEntry (verified 2026-10-06), so one call answers "which of this
 * page's serials are on hand, and in which warehouse". The range also holds serials of
 * items ISMS does not carry; the caller keeps only its own page's.
 *
 * The parameters are `:lo`/`:hi` because `:from` is rejected as SQL syntax. Filtering on
 * the warehouse type inside the query is not possible: the Service Layer's SQL allow-list
 * refuses OWHS. The warehouse is also the finest grain SAP has here — bins are not in use.
 */

export const SAP_SERIAL_LOCATION_QUERY = "ISMS_SN_LOC_RANGE";

/**
 * The same read keyed by warehouse instead of serial id, for a targeted sync of one
 * warehouse or branch: "which serials does SAP hold here". Same tables, same allow-list.
 */
export const SAP_SERIAL_WAREHOUSE_QUERY = "ISMS_SN_LOC_WHS";

/**
 * The saved queries ISMS creates in SAP when they are missing. Keep in step with QUERIES
 * in scripts/setup-sap-serial-onhand-query.mjs — the manual fallback for a SAP user that
 * is not allowed to create queries.
 */
const SAP_ONHAND_QUERY_DEFINITIONS: Record<string, { name: string; text: string }> = {
  [SAP_SERIAL_LOCATION_QUERY]: {
    name: "ISMS - serials on hand by serial range",
    text: [
      "SELECT T1.AbsEntry, T1.DistNumber, T0.ItemCode, T0.WhsCode",
      "FROM OSRQ T0",
      "INNER JOIN OSRN T1 ON T1.ItemCode = T0.ItemCode AND T1.SysNumber = T0.SysNumber",
      "WHERE T1.AbsEntry > :lo AND T1.AbsEntry <= :hi AND T0.Quantity > 0",
      "ORDER BY T1.AbsEntry, T0.WhsCode",
    ].join(" "),
  },
  [SAP_SERIAL_WAREHOUSE_QUERY]: {
    name: "ISMS - serials on hand in one warehouse",
    text: [
      "SELECT T1.AbsEntry, T1.DistNumber, T0.ItemCode, T0.WhsCode",
      "FROM OSRQ T0",
      "INNER JOIN OSRN T1 ON T1.ItemCode = T0.ItemCode AND T1.SysNumber = T0.SysNumber",
      "WHERE T0.WhsCode = :whs AND T0.Quantity > 0",
      "ORDER BY T1.AbsEntry",
    ].join(" "),
  },
};

/**
 * Queries already confirmed in a company DB by this process, so the check costs one
 * request per server start rather than one per sync. Keyed by connection + company DB.
 */
const confirmedQueries = new Set<string>();

/** Runaway guard on `odata.nextLink` chains. */
const MAX_PAGES = 2000;

/**
 * SAP's "No matching records found". `/List` answers an empty result with a 404 carrying
 * it — and answers a query that does not exist the same way, which is why
 * `ensureSapOnHandQuery` checks for the query separately.
 */
const SAP_NO_MATCHING_RECORDS = -2028;

/** A serial SAP holds on hand, and where. */
export interface SapSerialLocation {
  serialNo: string;
  itemCode: string;
  warehouseCode: string;
}

interface SapQueryListResponse {
  value?: Record<string, unknown>[];
  "odata.nextLink"?: string;
  "@odata.nextLink"?: string;
}

function sapErrorCode(rawBody: string): number | null {
  try {
    const parsed = JSON.parse(rawBody) as { error?: { code?: unknown } };
    const code = Number(parsed.error?.code);
    return Number.isFinite(code) ? code : null;
  } catch {
    return null;
  }
}

async function queryExists(creds: SapServiceLayerCredentials, code: string): Promise<boolean> {
  const response = await sapServiceLayerClient.request({
    creds,
    method: "GET",
    path: `/SQLQueries('${code}')?$select=SqlCode`,
  });
  if (response.statusCode === 404) return false;
  if (response.statusCode >= 400) {
    throw new Error(sapErrorMessage(response.statusCode, response.rawBody, "SQLQueries"));
  }
  return true;
}

/**
 * Make sure a saved query exists in this company DB, creating it if it does not — so a new
 * environment (production included) needs no manual setup step.
 *
 * Checked explicitly rather than inferred from `/List`: that answers "no rows" and "no
 * such query" alike (see `SAP_NO_MATCHING_RECORDS`), and reading a missing query as empty
 * would report every serial as not on hand.
 *
 * An existing query is never modified, even if its SQL differs — changing a query in a
 * live SAP is left to the setup script's `--replace`. If SAP refuses the create (the
 * Service Layer user may not be allowed to add queries), the error names the script.
 */
export async function ensureSapOnHandQuery(
  creds: SapServiceLayerCredentials,
  code: string = SAP_SERIAL_LOCATION_QUERY,
): Promise<void> {
  const cacheKey = `${creds.id}:${creds.companyDb}:${code}`;
  if (confirmedQueries.has(cacheKey)) return;

  const definition = SAP_ONHAND_QUERY_DEFINITIONS[code];
  if (!definition) throw new Error(`Unknown SAP saved query: ${code}`);

  if (!(await queryExists(creds, code))) {
    const created = await sapServiceLayerClient.request({
      creds,
      method: "POST",
      path: "/SQLQueries",
      body: { SqlCode: code, SqlName: definition.name, SqlText: definition.text },
    });
    // Another run may have created it in the meantime; only a query still missing is a failure.
    if (created.statusCode >= 400 && !(await queryExists(creds, code))) {
      throw new Error(
        `ISMS could not create the SAP saved query ${code} it reads stock from ` +
          `(${sapErrorMessage(created.statusCode, created.rawBody, "SQLQueries")}). ` +
          "Ask for the Service Layer user to be allowed to add queries, or run " +
          "scripts/setup-sap-serial-onhand-query.mjs once against this company database.",
      );
    }
  }

  confirmedQueries.add(cacheKey);
}

/**
 * Run a saved query's `/List` and follow SAP's paging to the end. `params` is the query
 * string after `?`, already encoded.
 */
async function listSerialLocations(
  creds: SapServiceLayerCredentials,
  code: string,
  params: string,
): Promise<SapSerialLocation[]> {
  const locations: SapSerialLocation[] = [];
  let path: string | null = `/SQLQueries('${code}')/List?${params}`;

  for (let page = 0; path; page += 1) {
    if (page >= MAX_PAGES) {
      throw new Error(`Stopped reading serial locations after ${MAX_PAGES} pages.`);
    }

    const response: SapServiceLayerRequestResult<SapQueryListResponse> =
      await sapServiceLayerClient.request<SapQueryListResponse>({
        creds,
        method: "GET",
        path,
        headers: { Prefer: `odata.maxpagesize=${sapPageSize()}` },
      });

    if (response.statusCode === 404 && sapErrorCode(response.rawBody) === SAP_NO_MATCHING_RECORDS) {
      break;
    }
    if (response.statusCode >= 400) {
      throw new Error(sapErrorMessage(response.statusCode, response.rawBody, "SQLQueries"));
    }

    for (const row of response.data?.value ?? []) {
      const serialNo = sapText(row.DistNumber);
      const itemCode = sapText(row.ItemCode);
      const warehouseCode = sapText(row.WhsCode);
      if (serialNo && itemCode && warehouseCode) locations.push({ serialNo, itemCode, warehouseCode });
    }

    const next: string | undefined =
      response.data?.["odata.nextLink"] ?? response.data?.["@odata.nextLink"];
    path = next ? `/${next.replace(/^\/+/, "")}` : null;
  }

  return locations;
}

/**
 * Every serial SAP holds on hand with an id in `(lo, hi]`, following SAP's paging to the
 * end. A serial on hand in two warehouses (a SAP data problem) appears once per warehouse.
 */
export function fetchSapSerialLocations(
  creds: SapServiceLayerCredentials,
  lo: number,
  hi: number,
): Promise<SapSerialLocation[]> {
  return listSerialLocations(
    creds,
    SAP_SERIAL_LOCATION_QUERY,
    `lo=${Math.floor(lo)}&hi=${Math.floor(hi)}`,
  );
}

/**
 * Every serial SAP holds on hand in one warehouse. A string parameter goes to the Service
 * Layer quoted, with any quote inside it doubled, the same as an OData literal.
 */
export async function fetchSapSerialsInWarehouse(
  creds: SapServiceLayerCredentials,
  warehouseCode: string,
): Promise<SapSerialLocation[]> {
  await ensureSapOnHandQuery(creds, SAP_SERIAL_WAREHOUSE_QUERY);
  const literal = `'${warehouseCode.replace(/'/g, "''")}'`;
  return listSerialLocations(
    creds,
    SAP_SERIAL_WAREHOUSE_QUERY,
    `whs=${encodeURIComponent(literal)}`,
  );
}
