import type {
  SapLoginInput,
  SapServiceLayerCredentials,
} from "@/features/sap/types/sap-service-layer";
import { sapHttpRequest } from "@/features/sap/services/sap-http";
import { fingerprintSecret } from "@/lib/crypto/encrypt-secret";

export type { SapLoginInput, SapServiceLayerCredentials };

export interface SapSessionRecord {
  configId: string;
  cookies: string;
  sessionId: string;
  expiresAt: number;
  companyDbFingerprint: string;
}

/** Default session TTL when Login response omits SessionTimeout (25 minutes). */
export const DEFAULT_SESSION_TTL_MS = 25 * 60 * 1000;
/** Refresh before expiry to avoid edge races. */
export const SESSION_SKEW_MS = 60 * 1000;

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

function isUsable(session: SapSessionRecord, fingerprint: string, now: number): boolean {
  if (session.companyDbFingerprint !== fingerprint) return false;
  return session.expiresAt > now + SESSION_SKEW_MS;
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

export const sapSessionManager = {
  getCached(configId: string): SapSessionRecord | undefined {
    return sessions.get(configId);
  },

  /**
   * Return a valid session for the config, logging in when missing/expired/fingerprint mismatch.
   * Concurrent callers for the same configId share one in-flight login promise.
   */
  async getSession(creds: SapServiceLayerCredentials): Promise<SapSessionRecord> {
    const fingerprint = credentialsFingerprint(creds);
    const now = Date.now();
    const cached = sessions.get(creds.id);
    if (cached && isUsable(cached, fingerprint, now)) {
      return cached;
    }

    if (cached) {
      sessions.delete(creds.id);
    }

    const existingLock = loginLocks.get(creds.id);
    if (existingLock) {
      return existingLock;
    }

    const loginPromise = (async () => {
      const session = await performLogin(creds);
      const stored: SapSessionRecord = { ...session, configId: creds.id };
      sessions.set(creds.id, stored);
      return stored;
    })().finally(() => {
      loginLocks.delete(creds.id);
    });

    loginLocks.set(creds.id, loginPromise);
    return loginPromise;
  },

  setSession(session: SapSessionRecord): void {
    if (!session.configId) return;
    sessions.set(session.configId, session);
  },

  invalidate(configId: string): void {
    sessions.delete(configId);
  },

  async logout(creds: SapServiceLayerCredentials): Promise<void> {
    const cached = sessions.get(creds.id);
    try {
      await performLogout(creds, cached?.cookies ?? null);
    } finally {
      sessions.delete(creds.id);
    }
  },
};
