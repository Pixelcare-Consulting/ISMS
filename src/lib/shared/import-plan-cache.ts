import { createHash } from "node:crypto";

/**
 * Short-lived memo of a built import plan, keyed by namespace + tenant + file digest.
 *
 * Chunked importers used to re-upload the workbook, re-parse it and re-run every
 * master-data query on each chunk, only to use one slice of the result. For a file of
 * a few thousand rows that is the dominant cost of the whole import.
 *
 * Caching keeps the security property the chunked design was built for: the plan is
 * still derived server-side from the uploaded bytes, never from anything the browser
 * sends. The client only ever holds the digest.
 *
 * A miss is always safe — callers fall back to rebuilding from the file — so this
 * stays correct on a cold or scaled-out instance. Step 2 (Redis + BullMQ) replaces
 * the `Map` below with a shared store; see `docs/bulk-import-optimization.md`.
 * Every importer shares this module, so that swap is still a one-file change.
 */

const TTL_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 16;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const globalForPlanCache = globalThis as unknown as {
  importPlanCache: Map<string, CacheEntry<unknown>> | undefined;
};

const store = globalForPlanCache.importPlanCache ?? new Map<string, CacheEntry<unknown>>();
globalForPlanCache.importPlanCache = store;

/**
 * Stable key for an uploaded file. Doubles as the opaque handle the client echoes.
 * `namespace` keeps two importers from colliding on the same bytes.
 */
export function planKeyFor(namespace: string, tenantId: string, file: Buffer): string {
  const digest = createHash("sha256").update(file).digest("hex");
  return `${namespace}:${tenantId}:${digest}`;
}

function evictExpired(now: number) {
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
  }
}

export function getCachedPlan<T>(planKey: string): T | null {
  const now = Date.now();
  const entry = store.get(planKey);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    store.delete(planKey);
    return null;
  }
  // Refresh recency so a long import never expires mid-apply.
  store.delete(planKey);
  entry.expiresAt = now + TTL_MS;
  store.set(planKey, entry);
  return entry.value as T;
}

export function setCachedPlan<T>(planKey: string, value: T): void {
  const now = Date.now();
  evictExpired(now);
  store.delete(planKey);
  store.set(planKey, { value, expiresAt: now + TTL_MS });
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next();
    if (oldest.done) break;
    store.delete(oldest.value);
  }
}

/** Called once an import finishes so a re-upload of the same file re-diffs the DB. */
export function invalidatePlan(planKey: string): void {
  store.delete(planKey);
}

/** Tenant-scoped clear — used when a plan is known to be stale (e.g. after a write). */
export function invalidatePlansForTenant(namespace: string, tenantId: string): void {
  const prefix = `${namespace}:${tenantId}:`;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
