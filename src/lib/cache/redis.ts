import { Redis } from "@upstash/redis";

let redisClient: Redis | null | undefined;

function getRedisClient(): Redis | null {
  if (redisClient !== undefined) {
    return redisClient;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    redisClient = null;
    return null;
  }

  redisClient = new Redis({ url, token });
  return redisClient;
}

export function cacheKey(...parts: string[]): string {
  return parts.join(":");
}

/**
 * In-process tier in front of Upstash.
 *
 * Two reasons it exists. First, Upstash is optional — when the env vars are absent
 * every helper below falls straight through, so call sites that look cached
 * (reason-status codes, master-data models, dashboard KPIs) were re-querying the
 * database every time. Second, even with Upstash configured a REST round trip is
 * not free, and hot keys like the inventory status codes are read several times
 * within a single server action.
 *
 * Deliberately short-lived and deliberately capped: the tier is per-instance, so
 * `deleteCache` on one instance cannot clear another's copy. `LOCAL_MAX_TTL_MS`
 * bounds how long any stale value can survive that, independent of the (much
 * longer) TTL the caller asked Redis for.
 */
const LOCAL_MAX_TTL_MS = 30_000;
const LOCAL_MAX_ENTRIES = 500;

const globalForLocalCache = globalThis as unknown as {
  appLocalCache: Map<string, { value: unknown; expiresAt: number }> | undefined;
};

const localCache =
  globalForLocalCache.appLocalCache ??
  new Map<string, { value: unknown; expiresAt: number }>();
globalForLocalCache.appLocalCache = localCache;

function localGet<T>(key: string): { hit: true; value: T } | { hit: false } {
  const entry = localCache.get(key);
  if (!entry) return { hit: false };
  if (entry.expiresAt <= Date.now()) {
    localCache.delete(key);
    return { hit: false };
  }
  return { hit: true, value: entry.value as T };
}

function localSet(key: string, value: unknown, ttlSeconds: number): void {
  const ttlMs = Math.min(ttlSeconds * 1000, LOCAL_MAX_TTL_MS);
  if (ttlMs <= 0) return;
  localCache.delete(key);
  localCache.set(key, { value, expiresAt: Date.now() + ttlMs });
  while (localCache.size > LOCAL_MAX_ENTRIES) {
    const oldest = localCache.keys().next();
    if (oldest.done) break;
    localCache.delete(oldest.value);
  }
}

function localDelete(key: string): void {
  localCache.delete(key);
}

/**
 * Read-through cache with graceful fallback when Upstash is not configured.
 */
export async function getOrSet<T>(
  key: string,
  ttlSeconds: number,
  fetchFn: () => Promise<T>,
): Promise<T> {
  const local = localGet<T>(key);
  if (local.hit) return local.value;

  const client = getRedisClient();
  if (!client) {
    const value = await fetchFn();
    localSet(key, value, ttlSeconds);
    return value;
  }

  try {
    const cached = (await client.get(key)) as T | null;
    if (cached !== null && cached !== undefined) {
      localSet(key, cached, ttlSeconds);
      return cached;
    }
  } catch {
    // Redis read failure — fall through to source
  }

  const value = await fetchFn();
  localSet(key, value, ttlSeconds);

  try {
    await client.set(key, value, { ex: ttlSeconds });
  } catch {
    // Redis write failure — return fresh value
  }

  return value;
}

/**
 * Read a cached value. Returns null when Upstash is not configured, the key is
 * missing, or Redis errors (fail-open).
 */
export async function getCache<T>(key: string): Promise<T | null> {
  const local = localGet<T>(key);
  if (local.hit) return local.value;

  const client = getRedisClient();
  if (!client) {
    return null;
  }

  try {
    const cached = (await client.get(key)) as T | null;
    if (cached === null || cached === undefined) {
      return null;
    }
    return cached;
  } catch {
    return null;
  }
}

/**
 * Write a cached value with TTL. No-op when Upstash is not configured or Redis errors.
 */
export async function setCache(
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  if (ttlSeconds <= 0) {
    return;
  }

  localSet(key, value, ttlSeconds);

  const client = getRedisClient();
  if (!client) {
    return;
  }

  try {
    await client.set(key, value, { ex: ttlSeconds });
  } catch {
    // Redis write failure — ignore
  }
}

/**
 * SET key value NX EX ttl. Returns true when this caller acquired the key.
 * Fail-open: returns true when Upstash is not configured or Redis errors so
 * callers still proceed (process-local locks remain the safety net).
 */
export async function setIfNotExists(
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<boolean> {
  const client = getRedisClient();
  if (!client) {
    return true;
  }

  if (ttlSeconds <= 0) {
    return true;
  }

  try {
    const result = await client.set(key, value, { nx: true, ex: ttlSeconds });
    return result === "OK";
  } catch {
    return true;
  }
}

export async function deleteCache(key: string): Promise<void> {
  localDelete(key);

  const client = getRedisClient();
  if (!client) {
    return;
  }

  try {
    await client.del(key);
  } catch {
    // ignore cache invalidation failures
  }
}

/**
 * Fixed-window rate limiter. Returns whether the action is allowed. Fails open
 * (allows) when Upstash isn't configured or errors, so it never blocks logins
 * due to infra issues.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number }> {
  const client = getRedisClient();
  if (!client) return { allowed: true, remaining: limit };

  try {
    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, windowSeconds);
    }
    return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
  } catch {
    return { allowed: true, remaining: limit };
  }
}

export const CACHE_TTL = {
  masterData: 300,
  reasonCodes: 120,
  dashboardKpis: 60,
} as const;
