import { sapServiceLayerClient } from "@/features/sap/services/sap-service-layer-client";
import type { SapServiceLayerCredentials } from "@/features/sap/types/sap-service-layer";
import { logger } from "@/lib/shared/logger";

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
 *
 * Paging is sequential (each `$skip` waits for the previous response), so this
 * constant is the single biggest lever on fetch time: 50k serials at 500/page is 100
 * serial round trips to SAP, at 2000/page it is 25. Raising it is safe — SAP is free
 * to return fewer rows than asked and the loop advances by the batch it actually got
 * — so tune it against your Service Layer rather than guessing. Overridable with
 * `SAP_PAGE_SIZE` so it can be tuned without a code change.
 */
const DEFAULT_PAGE_SIZE = 2000;

function pageSize(): number {
  const raw = process.env.SAP_PAGE_SIZE;
  if (!raw) return DEFAULT_PAGE_SIZE;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PAGE_SIZE;
}

/**
 * Runaway guard, not an expected limit: pageSize() * MAX_PAGES rows. Hitting it throws
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
 * Lanes for the per-row updates a sync cannot batch.
 *
 * Creates go through `createMany`, but updates carry per-row values, so they stay one
 * statement each. Running them serially made a few thousand changed rows a few
 * thousand sequential round trips. Only safe outside a `$transaction` — an interactive
 * transaction is pinned to one connection, so the branch and warehouse syncs (which
 * wrap their writes in one) deliberately still run serially.
 */
export const SAP_SYNC_WRITE_CONCURRENCY = 8;

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
  const requestedPageSize = pageSize();
  const startedAt = Date.now();
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
      headers: { Prefer: `odata.maxpagesize=${requestedPageSize}` },
    });

    if (response.statusCode >= 400) {
      throw new Error(sapErrorMessage(response.statusCode, response.rawBody, query.entity));
    }

    const batch = response.data?.value ?? [];
    if (batch.length === 0) {
      // Logged so the SAP half of a sync can be told apart from the Postgres half
      // without guessing. `effectivePageSize` is what SAP actually granted — if it is
      // well below `requestedPageSize`, the Service Layer is capping it server-side
      // and raising SAP_PAGE_SIZE further will not help.
      logger.info(
        {
          entity: query.entity,
          rows: records.length,
          pages: page,
          requestedPageSize,
          effectivePageSize: page > 0 ? Math.ceil(records.length / page) : 0,
          elapsedMs: Date.now() - startedAt,
        },
        "sap collection fetched",
      );
      return records;
    }

    records.push(...batch);
    skip += batch.length;
  }

  // Fell out of the loop with SAP still returning rows — refuse to report a partial
  // read as a complete one.
  throw new Error(
    `Reading ${query.entity} from SAP exceeded ${MAX_PAGES * requestedPageSize} rows. ` +
      `The sync was stopped so it does not apply a partial result.`,
  );
}
