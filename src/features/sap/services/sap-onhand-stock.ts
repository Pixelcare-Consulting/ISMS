import { sapErrorMessage, sapPageSize, sapText } from "@/features/sap/services/sap-master-data";
import {
  sapServiceLayerClient,
  type SapServiceLayerRequestResult,
} from "@/features/sap/services/sap-service-layer-client";
import type { SapServiceLayerCredentials } from "@/features/sap/types/sap-service-layer";

/**
 * Which serials SAP holds on hand in one warehouse — a branch or a stock warehouse alike,
 * since SAP keeps both in OWHS and tells them apart only by `U_Warehouse_Type`.
 *
 * `SerialNumberDetails` (OSRN) says which item a serial belongs to but not where it is.
 * Location lives in OSRQ (serial quantity per warehouse), which the Service Layer exposes
 * through no entity, so it is read through a saved query, installed once per company DB
 * by `scripts/setup-sap-serial-onhand-query.mjs`:
 *
 *   SELECT T0.ItemCode, T1.DistNumber, T0.WhsCode FROM OSRQ T0
 *   INNER JOIN OSRN T1 ON T1.ItemCode = T0.ItemCode AND T1.SysNumber = T0.SysNumber
 *   WHERE T0.WhsCode = :whs AND T0.Quantity > 0
 *   ORDER BY T0.ItemCode, T1.DistNumber
 *
 * Parameterised by warehouse because the Service Layer's SQL allow-list refuses OWHS
 * ("Table 'OWHS' not accessible"), so the query cannot filter on the warehouse type.
 *
 * The warehouse is the finest grain SAP has here: bin locations are not in use (only the
 * automatic system bin exists), so there is no position *within* a warehouse to read.
 *
 * Counting the rows per item gives SAP's "In Stock" (OITW.OnHand) for that warehouse —
 * every ISMS model is serial-managed. Verified against `ItemWarehouseInfoCollection`.
 */

/** Keep in step with SQL_CODE in scripts/setup-sap-serial-onhand-query.mjs. */
export const SAP_SERIAL_ONHAND_QUERY = "ISMS_SN_ONHAND";

/** Runaway guard on `odata.nextLink` chains when reading a warehouse whole. */
const MAX_PAGES = 2000;

/**
 * SAP's "No matching records found". `/List` answers an empty result with a 404 carrying
 * it — and answers a query that does not exist the same way, which is why
 * `assertSapOnHandQueryInstalled` has to be asked separately.
 */
const SAP_NO_MATCHING_RECORDS = -2028;

export interface SapOnHandSerial {
  itemCode: string;
  serialNo: string;
}

export interface SapOnHandPage {
  serials: SapOnHandSerial[];
  /** `$skip` for the next page, or null when this was the warehouse's last page. */
  nextSkip: number | null;
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

/** `$skip` from SAP's nextLink (`…/List?whs='X'&$skip=2000`). */
function skipFromNextLink(link: string | undefined): number | null {
  if (!link) return null;
  const match = /[?&]\$skip=(\d+)/.exec(link);
  return match ? Number(match[1]) : null;
}

/**
 * Fail loudly when the saved query is missing. Without this, every warehouse would read
 * as empty (see `SAP_NO_MATCHING_RECORDS`) and stock would be zeroed across the board.
 */
export async function assertSapOnHandQueryInstalled(
  creds: SapServiceLayerCredentials,
): Promise<void> {
  const response = await sapServiceLayerClient.request({
    creds,
    method: "GET",
    path: `/SQLQueries('${SAP_SERIAL_ONHAND_QUERY}')?$select=SqlCode`,
  });
  if (response.statusCode === 404) {
    throw new Error(
      `The SAP saved query ${SAP_SERIAL_ONHAND_QUERY} is not installed in this company ` +
        "database, so stock on hand cannot be read. Run " +
        "scripts/setup-sap-serial-onhand-query.mjs once against it.",
    );
  }
  if (response.statusCode >= 400) {
    throw new Error(sapErrorMessage(response.statusCode, response.rawBody, "SQLQueries"));
  }
}

/**
 * One page of a warehouse's on-hand serials, starting `skip` rows in. Resumable: a large
 * warehouse (one holds ~137k serials) is read across several runs by saving `nextSkip`.
 */
export async function fetchSapOnHandPage(
  creds: SapServiceLayerCredentials,
  warehouseCode: string,
  skip = 0,
): Promise<SapOnHandPage> {
  const whs = encodeURIComponent(warehouseCode.replace(/'/g, "''"));
  const path =
    `/SQLQueries('${SAP_SERIAL_ONHAND_QUERY}')/List?whs='${whs}'` +
    (skip > 0 ? `&$skip=${skip}` : "");

  const response: SapServiceLayerRequestResult<SapQueryListResponse> =
    await sapServiceLayerClient.request<SapQueryListResponse>({
      creds,
      method: "GET",
      path,
      headers: { Prefer: `odata.maxpagesize=${sapPageSize()}` },
    });

  if (response.statusCode === 404 && sapErrorCode(response.rawBody) === SAP_NO_MATCHING_RECORDS) {
    return { serials: [], nextSkip: null };
  }
  if (response.statusCode >= 400) {
    throw new Error(sapErrorMessage(response.statusCode, response.rawBody, "SQLQueries"));
  }

  const serials: SapOnHandSerial[] = [];
  for (const row of response.data?.value ?? []) {
    const itemCode = sapText(row.ItemCode);
    const serialNo = sapText(row.DistNumber);
    if (itemCode && serialNo) serials.push({ itemCode, serialNo });
  }

  return {
    serials,
    nextSkip: skipFromNextLink(
      response.data?.["odata.nextLink"] ?? response.data?.["@odata.nextLink"],
    ),
  };
}

/** Every serial SAP holds on hand in one warehouse. For branches, which are small. */
export async function fetchSapOnHandSerials(
  creds: SapServiceLayerCredentials,
  warehouseCode: string,
): Promise<SapOnHandSerial[]> {
  const serials: SapOnHandSerial[] = [];
  let skip: number | null = 0;
  for (let page = 0; skip !== null; page += 1) {
    if (page >= MAX_PAGES) {
      throw new Error(
        `Stopped reading stock for ${warehouseCode} after ${MAX_PAGES} pages — SAP kept ` +
          "returning more.",
      );
    }
    const result: SapOnHandPage = await fetchSapOnHandPage(creds, warehouseCode, skip);
    serials.push(...result.serials);
    skip = result.nextSkip;
  }
  return serials;
}

/** Units on hand per SAP item code. */
export function countByItem(serials: SapOnHandSerial[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const serial of serials) {
    counts.set(serial.itemCode, (counts.get(serial.itemCode) ?? 0) + 1);
  }
  return counts;
}
