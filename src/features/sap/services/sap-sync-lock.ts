const inFlight = new Map<string, Promise<unknown>>();

/**
 * Runs `run` only if no sync for `key` is already in flight; a caller that arrives while
 * one is running joins the same promise instead of firing a second SAP fetch. Guards
 * against duplicate SAP calls from a second tab, a stale/refreshed page re-triggering a
 * sync the server never finished, or a slow double click.
 *
 * In-memory only — a full server restart drops the lock along with the sync it was
 * guarding. Key by `${entity}:${tenantId}` so unrelated entities/tenants never block
 * each other, e.g. `branch:${tenantId}`.
 */
export function withSapSyncLock<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = run().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}
