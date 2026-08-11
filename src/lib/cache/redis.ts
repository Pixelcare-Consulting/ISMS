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
 * Read-through cache with graceful fallback when Upstash is not configured.
 */
export async function getOrSet<T>(
  key: string,
  ttlSeconds: number,
  fetchFn: () => Promise<T>,
): Promise<T> {
  const client = getRedisClient();
  if (!client) {
    return fetchFn();
  }

  try {
    const cached = (await client.get(key)) as T | null;
    if (cached !== null && cached !== undefined) {
      return cached;
    }
  } catch {
    // Redis read failure — fall through to source
  }

  const value = await fetchFn();

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
  const client = getRedisClient();
  if (!client) {
    return;
  }

  if (ttlSeconds <= 0) {
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
