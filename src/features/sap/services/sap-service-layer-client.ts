import type {
  SapLoginInput,
  SapServiceLayerCredentials,
} from "@/features/sap/types/sap-service-layer";
import {
  sapHttpRequest,
  type SapHttpMethod,
  type SapHttpResponse,
} from "@/features/sap/services/sap-http";
import {
  normalizeBaseUrl,
  performLogin,
  performLogout,
  sapSessionManager,
  type SapSessionRecord,
} from "@/features/sap/services/sap-session-manager";

export interface SapServiceLayerRequestOptions {
  creds: SapServiceLayerCredentials;
  method: SapHttpMethod;
  /** Path relative to Service Layer base URL, e.g. `/Orders` or `Orders`. */
  path: string;
  body?: unknown;
}

export interface SapServiceLayerRequestResult<T = unknown> {
  statusCode: number;
  data: T | null;
  rawBody: string;
  headers: SapHttpResponse["headers"];
}

function joinPath(baseUrl: string, path: string): string {
  const base = normalizeBaseUrl(baseUrl);
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

function isInvalidSessionResponse(response: SapHttpResponse): boolean {
  if (response.statusCode === 401) return true;
  if (!response.body) return false;
  return /invalid\s+session|session\s+.*expired|not\s+authenticated/i.test(response.body);
}

function parseJsonBody<T>(body: string): T | null {
  if (!body.trim()) return null;
  try {
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
}

async function executeWithCookies(
  options: SapServiceLayerRequestOptions,
  cookies: string,
): Promise<SapHttpResponse> {
  return sapHttpRequest({
    method: options.method,
    url: joinPath(options.creds.baseUrl, options.path),
    body: options.body,
    verifySsl: options.creds.verifySsl,
    headers: { Cookie: cookies },
  });
}

/**
 * Public SAP B1 Service Layer client: session-aware request + login/logout.
 * Live document posting is not wired yet — queue still uses the mock processor.
 */
export const sapServiceLayerClient = {
  /**
   * Login to Service Layer. When `creds.id` is set, caches the session in-process.
   */
  async login(creds: SapLoginInput): Promise<SapSessionRecord> {
    const session = await performLogin(creds);
    if (creds.id) {
      const stored: SapSessionRecord = { ...session, configId: creds.id };
      sapSessionManager.setSession(stored);
      return stored;
    }
    return session;
  },

  /**
   * Logout and clear any cached session for this config id.
   * Pass `cookieHeader` for ad-hoc logins that were never cached.
   */
  async logout(creds: SapLoginInput, cookieHeader?: string | null): Promise<void> {
    const cached = creds.id ? sapSessionManager.getCached(creds.id) : undefined;
    const cookies =
      cookieHeader !== undefined ? cookieHeader : (cached?.cookies ?? null);
    try {
      await performLogout(creds, cookies);
    } catch {
      // Best-effort logout — session may already be expired.
    } finally {
      if (creds.id) sapSessionManager.invalidate(creds.id);
    }
  },

  /**
   * Authenticated Service Layer request with proactive TTL refresh and a single 401 retry.
   */
  async request<T = unknown>(
    options: SapServiceLayerRequestOptions,
  ): Promise<SapServiceLayerRequestResult<T>> {
    const session = await sapSessionManager.getSession(options.creds);
    let response = await executeWithCookies(options, session.cookies);

    if (isInvalidSessionResponse(response)) {
      sapSessionManager.invalidate(options.creds.id);
      const refreshed = await sapSessionManager.getSession(options.creds);
      response = await executeWithCookies(options, refreshed.cookies);
    }

    return {
      statusCode: response.statusCode,
      data: parseJsonBody<T>(response.body),
      rawBody: response.body,
      headers: response.headers,
    };
  },
};
