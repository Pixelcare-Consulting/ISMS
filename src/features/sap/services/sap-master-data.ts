/**
 * Small shared helpers for the SAP → ISMS master-data syncs.
 *
 * Paging, resuming and reporting live in `sap-sync-engine.ts`; per-entity mapping lives in
 * that entity's descriptor. What is left here is the handful of things both of them need.
 */

/**
 * Rows per Service Layer request.
 *
 * Paging is sequential — each page waits for the one before it — so this is the single
 * biggest lever on how long a large read takes: 4M serials at 500/page is 8,000 round
 * trips, at 2000/page it is 2,000. Raising it is safe, since SAP is free to return fewer
 * rows than asked and paging follows what it actually got. Overridable with
 * `SAP_PAGE_SIZE` so it can be tuned against a particular Service Layer without a code
 * change.
 */
const DEFAULT_PAGE_SIZE = 2000;

export function sapPageSize(): number {
  const raw = process.env.SAP_PAGE_SIZE;
  if (!raw) return DEFAULT_PAGE_SIZE;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PAGE_SIZE;
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
export function parseSapFlag(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const normalized = (value ?? "").toString().trim().toLowerCase();
  return normalized === "tyes" || normalized === "y" || normalized === "true";
}

/** Read a SAP string field: absent, null and whitespace all mean "blank". */
export function sapText(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

/** Rows per write batch when applying a page. Keeps single statements bounded. */
export const SAP_SYNC_CHUNK = 500;

/**
 * Lanes for the per-row updates a sync cannot batch.
 *
 * Creates go through `createMany`, but updates carry per-row values, so they stay one
 * statement each. Running them serially made a few thousand changed rows a few thousand
 * sequential round trips.
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
