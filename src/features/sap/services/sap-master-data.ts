import { sapServiceLayerClient } from "@/features/sap/services/sap-service-layer-client";
import type { SapServiceLayerCredentials } from "@/features/sap/types/sap-service-layer";

/**
 * Read helpers shared by the SAP → ISMS master-data syncs.
 * Everything here is generic over the entity; per-entity field mapping stays in the
 * calling sync service.
 */

/**
 * Service Layer caps page size server-side (default 20), so `$top` is unreliable —
 * we page with `$skip` until a request comes back empty. The cap is a runaway guard.
 */
const MAX_PAGES = 200;

interface SapCollectionResponse<T> {
  value?: T[];
}

/** Surface SAP's own error text — a bare status code is useless for diagnosing this. */
export function sapErrorMessage(
  statusCode: number,
  rawBody: string,
  entity: string,
): string {
  try {
    const parsed = JSON.parse(rawBody) as {
      error?: { message?: string | { value?: string } };
    };
    const message = parsed.error?.message;
    const text = typeof message === "string" ? message : message?.value;
    if (text) return `SAP returned ${statusCode}: ${text}`;
  } catch {
    // Non-JSON body (HTML error page, proxy response) — fall through.
  }
  return `SAP returned ${statusCode} while reading ${entity}`;
}

/**
 * SAP reports yes/no flags as tYES/tNO on most master-data entities, boolean on some.
 * Anything unrecognized reads as false, which is the permissive/"not disabled" answer.
 */
export function parseSapFlag(value: boolean | string | null | undefined): boolean {
  if (typeof value === "boolean") return value;
  const normalized = (value ?? "").toString().trim().toLowerCase();
  return normalized === "tyes" || normalized === "y" || normalized === "true";
}

/** Fetch every row of a Service Layer entity set, paging until it runs dry. */
export async function fetchSapCollection<T>(
  creds: SapServiceLayerCredentials,
  query: { entity: string; select: string },
): Promise<T[]> {
  const records: T[] = [];
  let skip = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response = await sapServiceLayerClient.request<SapCollectionResponse<T>>({
      creds,
      method: "GET",
      path: `/${query.entity}?$select=${query.select}&$skip=${skip}`,
    });

    if (response.statusCode >= 400) {
      throw new Error(sapErrorMessage(response.statusCode, response.rawBody, query.entity));
    }

    const batch = response.data?.value ?? [];
    if (batch.length === 0) break;

    records.push(...batch);
    skip += batch.length;
  }

  return records;
}
