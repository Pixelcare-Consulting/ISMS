import { sapErrorMessage, sapPageSize, sapText } from "@/features/sap/services/sap-master-data";
import {
  sapServiceLayerClient,
  type SapServiceLayerRequestResult,
} from "@/features/sap/services/sap-service-layer-client";
import type { SapServiceLayerCredentials } from "@/features/sap/types/sap-service-layer";

/**
 * Which serials SAP holds on hand in a branch's warehouse.
 *
 * `SerialNumberDetails` (OSRN) says which item a serial belongs to but not where it is;
 * location lives in OSRQ (serial quantity per warehouse), which the Service Layer exposes
 * through no entity. It is read through a saved query instead, installed once per company
 * DB by `scripts/setup-sap-serial-onhand-query.mjs`:
 *
 *   SELECT T0.ItemCode, T1.DistNumber, T0.WhsCode FROM OSRQ T0
 *   INNER JOIN OSRN T1 ON T1.ItemCode = T0.ItemCode AND T1.SysNumber = T0.SysNumber
 *   WHERE T0.WhsCode = :whs AND T0.Quantity > 0
 *
 * Parameterised by warehouse rather than filtered on the warehouse type, because the
 * Service Layer's SQL allow-list refuses OWHS ("Table 'OWHS' not accessible"). Asking per
 * ISMS branch also keeps the read to branch stock — warehouse stock is most of OSRQ.
 *
 * Counting these rows per item gives SAP's "In Stock" for the branch: every ISMS model is
 * serial-managed, so OITW.OnHand and the serials on hand are the same number.
 */

/** Keep in step with SQL_CODE in scripts/setup-sap-serial-onhand-query.mjs. */
export const SAP_SERIAL_ONHAND_QUERY = "ISMS_SN_ONHAND";

/** Runaway guard on `odata.nextLink` chains — far beyond any one branch's stock. */
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

/**
 * Fail loudly when the saved query is missing. Without this, every branch would read as
 * empty (see `SAP_NO_MATCHING_RECORDS`) and the planogram's on-hand would be zeroed.
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
        "database, so branch stock cannot be read. Run " +
        "scripts/setup-sap-serial-onhand-query.mjs once against it.",
    );
  }
  if (response.statusCode >= 400) {
    throw new Error(sapErrorMessage(response.statusCode, response.rawBody, "SQLQueries"));
  }
}

/** Every serial SAP holds on hand in one warehouse, following SAP's paging to the end. */
export async function fetchSapOnHandSerials(
  creds: SapServiceLayerCredentials,
  warehouseCode: string,
): Promise<SapOnHandSerial[]> {
  const serials: SapOnHandSerial[] = [];
  const whs = warehouseCode.replace(/'/g, "''");
  let path: string | null =
    `/SQLQueries('${SAP_SERIAL_ONHAND_QUERY}')/List?whs='${encodeURIComponent(whs)}'`;

  for (let page = 0; path; page += 1) {
    if (page >= MAX_PAGES) {
      throw new Error(
        `Stopped reading stock for ${warehouseCode} after ${MAX_PAGES} pages — SAP kept ` +
          "returning more, which no branch should.",
      );
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
      const itemCode = sapText(row.ItemCode);
      const serialNo = sapText(row.DistNumber);
      if (itemCode && serialNo) serials.push({ itemCode, serialNo });
    }

    const next: string | undefined =
      response.data?.["odata.nextLink"] ?? response.data?.["@odata.nextLink"];
    path = next ? `/${next.replace(/^\/+/, "")}` : null;
  }

  return serials;
}
