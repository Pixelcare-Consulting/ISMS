import type { AiAssistantLimits } from "@/features/ai/constants/assistant-limits";
import { getRedisClient } from "@/lib/cache/redis";

const CONCURRENCY_TTL_SECONDS = 120;
const LOCAL_COUNTER_PRUNE_AT = 500;

type LocalCounter = { value: number; expiresAt: number | null };

const globalForAiLimits = globalThis as typeof globalThis & {
  ismsAiRequestLimits?: Map<string, LocalCounter>;
};

function localCounters(): Map<string, LocalCounter> {
  const existing = globalForAiLimits.ismsAiRequestLimits;
  if (existing) return existing;
  const created = new Map<string, LocalCounter>();
  globalForAiLimits.ismsAiRequestLimits = created;
  return created;
}

function readLocalCounter(key: string): LocalCounter | undefined {
  const counters = localCounters();
  const entry = counters.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
    counters.delete(key);
    return undefined;
  }
  return entry;
}

function pruneExpiredLocalCounters(): void {
  const counters = localCounters();
  if (counters.size < LOCAL_COUNTER_PRUNE_AT) return;
  const now = Date.now();
  for (const [key, entry] of counters) {
    if (entry.expiresAt !== null && entry.expiresAt <= now) {
      counters.delete(key);
    }
  }
}

export type AiLimitClient = {
  incr: (key: string) => Promise<number>;
  decr: (key: string) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<unknown>;
};

/**
 * Same fixed-window counters as Redis, kept in this process only.
 * Used when Upstash is not configured. A configured Redis error does not land here.
 */
const localAiLimitClient: AiLimitClient = {
  async incr(key) {
    pruneExpiredLocalCounters();
    const counters = localCounters();
    const current = readLocalCounter(key);
    if (!current) {
      counters.set(key, { value: 1, expiresAt: null });
      return 1;
    }
    current.value += 1;
    return current.value;
  },
  async decr(key) {
    const current = readLocalCounter(key);
    if (!current) return 0;
    current.value -= 1;
    if (current.value <= 0) {
      localCounters().delete(key);
      return 0;
    }
    return current.value;
  },
  async expire(key, seconds) {
    const current = readLocalCounter(key);
    if (!current) return 0;
    current.expiresAt = Date.now() + seconds * 1000;
    return 1;
  },
};

export type AiReservation =
  | { ok: true; release: () => Promise<void> }
  | { ok: false; reason: "unavailable" | "rate" | "concurrency" };

/**
 * AI request cap. No Upstash client: the same ceilings are kept in this
 * process. A configured Redis call that throws or times out denies the request.
 * Login rate limiting stays on the fail-open `rateLimit` helper.
 */
export async function reserveAiRequest(input: {
  tenantId: string;
  userId: string;
  limits: Pick<
    AiAssistantLimits,
    | "maxRequestsPerUser"
    | "maxRequestsPerTenant"
    | "windowSeconds"
    | "maxUserConcurrency"
    | "maxTenantConcurrency"
  >;
  client?: AiLimitClient | null;
}): Promise<AiReservation> {
  const configured = input.client === undefined ? getRedisClient() : input.client;
  const client = configured ?? localAiLimitClient;

  const userRateKey = `ai:rate:user:${input.tenantId}:${input.userId}`;
  const tenantRateKey = `ai:rate:tenant:${input.tenantId}`;
  const userConcKey = `ai:conc:user:${input.tenantId}:${input.userId}`;
  const tenantConcKey = `ai:conc:tenant:${input.tenantId}`;
  let userConcHeld = false;
  let tenantConcHeld = false;

  const releaseHeld = async () => {
    try {
      if (tenantConcHeld) await client.decr(tenantConcKey);
      if (userConcHeld) await client.decr(userConcKey);
    } catch {
      // The concurrency key expires on its own.
    }
  };

  try {
    const userCount = await client.incr(userRateKey);
    if (userCount === 1) await client.expire(userRateKey, input.limits.windowSeconds);
    if (userCount > input.limits.maxRequestsPerUser) {
      return { ok: false, reason: "rate" };
    }

    const tenantCount = await client.incr(tenantRateKey);
    if (tenantCount === 1) await client.expire(tenantRateKey, input.limits.windowSeconds);
    if (tenantCount > input.limits.maxRequestsPerTenant) {
      return { ok: false, reason: "rate" };
    }

    const userConc = await client.incr(userConcKey);
    userConcHeld = true;
    await client.expire(userConcKey, CONCURRENCY_TTL_SECONDS);
    if (userConc > input.limits.maxUserConcurrency) {
      await releaseHeld();
      return { ok: false, reason: "concurrency" };
    }

    const tenantConc = await client.incr(tenantConcKey);
    tenantConcHeld = true;
    await client.expire(tenantConcKey, CONCURRENCY_TTL_SECONDS);
    if (tenantConc > input.limits.maxTenantConcurrency) {
      await releaseHeld();
      return { ok: false, reason: "concurrency" };
    }

    let released = false;
    return {
      ok: true,
      release: async () => {
        if (released) return;
        released = true;
        userConcHeld = true;
        tenantConcHeld = true;
        await releaseHeld();
        userConcHeld = false;
        tenantConcHeld = false;
      },
    };
  } catch {
    await releaseHeld();
    return { ok: false, reason: "unavailable" };
  }
}
