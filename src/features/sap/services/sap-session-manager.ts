import type {
  SapLoginInput,
  SapServiceLayerCredentials,
} from "@/features/sap/types/sap-service-layer";
import { sapHttpRequest } from "@/features/sap/services/sap-http";
import {
  cacheKey,
  deleteCache,
  getCache,
  setCache,
  setIfNotExists,
} from "@/lib/cache/redis";
import { decryptSecret, encryptSecret, fingerprintSecret } from "@/lib/crypto/encrypt-secret";

export type { SapLoginInput, SapServiceLayerCredentials };

export interface SapSessionRecord {
  configId: string;
  cookies: string;
  sessionId: string;
  expiresAt: number;
  companyDbFingerprint: string;
}

/** Redis-stored shape — cookies encrypted at rest. */
interface SapSessionRedisPayload {
  cookiesEncrypted: string;
  sessionId: string;
  expiresAt: number;
  companyDbFingerprint: string;
}

/** Default session TTL when Login response omits SessionTimeout (25 minutes). */
export const DEFAULT_SESSION_TTL_MS = 25 * 60 * 1000;
/** Refresh before expiry to avoid edge races. */
export const SESSION_SKEW_MS = 60 * 1000;
/** Short Redis lock so multiple Node instances do not double-login. */
const LOGIN_LOCK_TTL_SECONDS = 30;
const LOGIN_LOCK_WAIT_MS = 400;
const LOGIN_LOCK_MAX_WAIT_MS = 8_000;

const sessions = new Map<string, SapSessionRecord>();
const loginLocks = new Map<string, Promise<SapSessionRecord>>();

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/$/, "");
}

export function credentialsFingerprint(
  creds: Pick<SapLoginInput, "baseUrl" | "companyDb" | "username">,
): string {
  return fingerprintSecret(
    `${normalizeBaseUrl(creds.baseUrl)}|${creds.companyDb.trim()}|${creds.username.trim()}`,
  );
}

function sessionRedisKey(configId: string): string {
  return cacheKey("sap", "b1session", configId);
}

function loginLockRedisKey(configId: string): string {
  return cacheKey("sap", "b1session", "lock", configId);
}

function isUsable(session: SapSessionRecord, fingerprint: string, now: number): boolean {
  if (session.companyDbFingerprint !== fingerprint) return false;
  return session.expiresAt > now + SESSION_SKEW_MS;
}

function remainingTtlSeconds(expiresAt: number, now: number = Date.now()): number {
  return Math.max(0, Math.floor((expiresAt - now) / 1000));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseLoginBody(body: string): {
  SessionId?: string;
  SessionTimeout?: number;
} {
  try {
    return JSON.parse(body) as { SessionId?: string; SessionTimeout?: number };
  } catch {
    throw new Error("SAP Login response is not valid JSON");
  }
}

async function readRedisSession(configId: string): Promise<SapSessionRecord | null> {
  const payload = await getCache<SapSessionRedisPayload>(sessionRedisKey(configId));
  if (!payload) return null;

  try {
    const cookies = decryptSecret(payload.cookiesEncrypted);
    return {
      configId,
      cookies,
      sessionId: payload.sessionId,
      expiresAt: payload.expiresAt,
      companyDbFingerprint: payload.companyDbFingerprint,
    };
  } catch {
    await deleteCache(sessionRedisKey(configId));
    return null;
  }
}

async function writeRedisSession(session: SapSessionRecord): Promise<void> {
  const ttlSeconds = remainingTtlSeconds(session.expiresAt);
  if (ttlSeconds <= 0) return;

  const payload: SapSessionRedisPayload = {
    cookiesEncrypted: encryptSecret(session.cookies),
    sessionId: session.sessionId,
    expiresAt: session.expiresAt,
    companyDbFingerprint: session.companyDbFingerprint,
  };
  await setCache(sessionRedisKey(session.configId), payload, ttlSeconds);
}

async function clearRedisSession(configId: string): Promise<void> {
  await deleteCache(sessionRedisKey(configId));
}

/**
 * POST /Login and build a session record. Does not touch the cache.
 * SessionTimeout from SAP is treated as minutes when present.
 */
export async function performLogin(creds: SapLoginInput): Promise<SapSessionRecord> {
  const baseUrl = normalizeBaseUrl(creds.baseUrl);
  const languageCode = creds.languageCode?.trim() || "23";
  const response = await sapHttpRequest({
    method: "POST",
    url: `${baseUrl}/Login`,
    verifySsl: creds.verifySsl,
    body: {
      CompanyDB: creds.companyDb.trim(),
      UserName: creds.username.trim(),
      Password: creds.password,
      Language: Number(languageCode),
    },
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(
      `SAP Login failed (${response.statusCode}): ${response.body || "Unknown SAP response"}`,
    );
  }

  const json = parseLoginBody(response.body);
  if (!json.SessionId) {
    throw new Error("SAP Login did not return a session id");
  }

  const cookies = response.cookieHeader;
  if (!cookies) {
    throw new Error("SAP Login did not return session cookies");
  }

  const timeoutMinutes =
    typeof json.SessionTimeout === "number" && json.SessionTimeout > 0
      ? json.SessionTimeout
      : null;
  const ttlMs = timeoutMinutes != null ? timeoutMinutes * 60 * 1000 : DEFAULT_SESSION_TTL_MS;

  return {
    configId: creds.id ?? "",
    cookies,
    sessionId: json.SessionId,
    expiresAt: Date.now() + ttlMs,
    companyDbFingerprint: credentialsFingerprint(creds),
  };
}

/**
 * POST /Logout with optional Cookie header. Best-effort; errors are swallowed by callers.
 */
export async function performLogout(
  creds: Pick<SapLoginInput, "baseUrl" | "verifySsl">,
  cookieHeader: string | null,
): Promise<void> {
  const baseUrl = normalizeBaseUrl(creds.baseUrl);
  await sapHttpRequest({
    method: "POST",
    url: `${baseUrl}/Logout`,
    verifySsl: creds.verifySsl,
    body: {},
    headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
  });
}

/**
 * Wait briefly for another instance's login to land in Redis, then return it if usable.
 */
async function waitForRedisSession(
  configId: string,
  fingerprint: string,
): Promise<SapSessionRecord | null> {
  const deadline = Date.now() + LOGIN_LOCK_MAX_WAIT_MS;
  while (Date.now() < deadline) {
    await sleep(LOGIN_LOCK_WAIT_MS);
    const fromRedis = await readRedisSession(configId);
    if (fromRedis && isUsable(fromRedis, fingerprint, Date.now())) {
      sessions.set(configId, fromRedis);
      return fromRedis;
    }
  }
  return null;
}

export const sapSessionManager = {
  /**
   * L1 then Redis. Hydrates L1 on Redis hit. Returns undefined when missing/expired.
   */
  async getCached(configId: string): Promise<SapSessionRecord | undefined> {
    const now = Date.now();
    const l1 = sessions.get(configId);
    if (l1 && l1.expiresAt > now + SESSION_SKEW_MS) {
      return l1;
    }
    if (l1) {
      sessions.delete(configId);
    }

    const fromRedis = await readRedisSession(configId);
    if (!fromRedis) return undefined;
    if (fromRedis.expiresAt <= now + SESSION_SKEW_MS) {
      await clearRedisSession(configId);
      return undefined;
    }

    sessions.set(configId, fromRedis);
    return fromRedis;
  },

  /**
   * Return a valid session for the config, logging in when missing/expired/fingerprint mismatch.
   * Concurrent callers share one in-flight login (process lock + Redis SET NX).
   */
  async getSession(creds: SapServiceLayerCredentials): Promise<SapSessionRecord> {
    const fingerprint = credentialsFingerprint(creds);
    const now = Date.now();

    const l1 = sessions.get(creds.id);
    if (l1 && isUsable(l1, fingerprint, now)) {
      return l1;
    }
    if (l1) {
      sessions.delete(creds.id);
    }

    const fromRedis = await readRedisSession(creds.id);
    if (fromRedis && isUsable(fromRedis, fingerprint, now)) {
      sessions.set(creds.id, fromRedis);
      return fromRedis;
    }
    if (fromRedis) {
      await clearRedisSession(creds.id);
    }

    const existingLock = loginLocks.get(creds.id);
    if (existingLock) {
      return existingLock;
    }

    const loginPromise = (async () => {
      const acquired = await setIfNotExists(
        loginLockRedisKey(creds.id),
        "1",
        LOGIN_LOCK_TTL_SECONDS,
      );

      if (!acquired) {
        const waited = await waitForRedisSession(creds.id, fingerprint);
        if (waited) return waited;
      }

      try {
        const again = await readRedisSession(creds.id);
        if (again && isUsable(again, fingerprint, Date.now())) {
          sessions.set(creds.id, again);
          return again;
        }

        const session = await performLogin(creds);
        const stored: SapSessionRecord = { ...session, configId: creds.id };
        sessions.set(creds.id, stored);
        await writeRedisSession(stored);
        return stored;
      } finally {
        if (acquired) {
          await deleteCache(loginLockRedisKey(creds.id));
        }
      }
    })().finally(() => {
      loginLocks.delete(creds.id);
    });

    loginLocks.set(creds.id, loginPromise);
    return loginPromise;
  },

  async setSession(session: SapSessionRecord): Promise<void> {
    if (!session.configId) return;
    sessions.set(session.configId, session);
    await writeRedisSession(session);
  },

  async invalidate(configId: string): Promise<void> {
    sessions.delete(configId);
    await clearRedisSession(configId);
  },

  async logout(creds: SapServiceLayerCredentials): Promise<void> {
    const cached =
      sessions.get(creds.id) ?? (await readRedisSession(creds.id)) ?? undefined;
    try {
      await performLogout(creds, cached?.cookies ?? null);
    } finally {
      sessions.delete(creds.id);
      await clearRedisSession(creds.id);
    }
  },
};
