import { sapServiceLayerClient } from "@/features/sap/services/sap-service-layer-client";
import type { SapServiceLayerCredentials } from "@/features/sap/types/sap-service-layer";

/**
 * Read helpers shared by the SAP → ISMS master-data syncs.
 * Everything here is generic over the entity; per-entity field mapping stays in the
 * calling sync service.
 */

/**
 * Service Layer caps page size server-side (default 20), so `$top` is unreliable —
 * we page with `$skip` until a request comes back empty. `Prefer: odata.maxpagesize`
 * raises that server-side cap so a full item/serial read doesn't take thousands of
 * round trips.
 */
const PAGE_SIZE = 500;

/**
 * Runaway guard, not an expected limit: PAGE_SIZE * MAX_PAGES rows. Hitting it throws
 * rather than returning what we have — a short read would otherwise look like a
 * successful sync whose missing rows all report as "not in SAP".
 */
const MAX_PAGES = 2000;

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

/** Rows per write batch when applying a sync. Keeps single statements bounded. */
export const SAP_SYNC_CHUNK = 500;

/**
 * Turn a failed sync write into a reason a user can act on. The case worth naming is
 * P2002 — an ISMS unique constraint refusing a row SAP considers legitimate.
 */
export function describeWriteError(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const { code, meta } = error as { code: string; meta?: { target?: unknown } };
    if (code === "P2002") {
      const target = Array.isArray(meta?.target)
        ? meta.target.filter((f): f is string => typeof f === "string")
        : [];
      const field = target.filter((f) => f !== "tenant_id").join(", ");
      return field
        ? `Another ISMS record already uses this ${field}`
        : "Conflicts with an existing ISMS record";
    }
  }
  return error instanceof Error ? error.message : "Could not be saved";
}

/** Fetch every row of a Service Layer entity set, paging until it runs dry. */
export async function fetchSapCollection<T>(
  creds: SapServiceLayerCredentials,
  /** `orderBy` should be the entity's key — paging by `$skip` needs a stable sort. */
  query: { entity: string; select: string; orderBy: string; filter?: string },
): Promise<T[]> {
  const records: T[] = [];
  let skip = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const params = [
      `$select=${query.select}`,
      `$orderby=${query.orderBy}`,
      `$skip=${skip}`,
    ];
    if (query.filter) params.splice(1, 0, `$filter=${encodeURIComponent(query.filter)}`);

    const response = await sapServiceLayerClient.request<SapCollectionResponse<T>>({
      creds,
      method: "GET",
      path: `/${query.entity}?${params.join("&")}`,
      headers: { Prefer: `odata.maxpagesize=${PAGE_SIZE}` },
    });

    if (response.statusCode >= 400) {
      throw new Error(sapErrorMessage(response.statusCode, response.rawBody, query.entity));
    }

    const batch = response.data?.value ?? [];
    if (batch.length === 0) return records;

    records.push(...batch);
    skip += batch.length;
  }

  // Fell out of the loop with SAP still returning rows — refuse to report a partial
  // read as a complete one.
  throw new Error(
    `Reading ${query.entity} from SAP exceeded ${MAX_PAGES * PAGE_SIZE} rows. ` +
      `The sync was stopped so it does not apply a partial result.`,
  );
}
