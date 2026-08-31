import { request as httpRequest } from "node:http";
import type { IncomingHttpHeaders } from "node:http";
import { request as httpsRequest } from "node:https";

export type SapHttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface SapHttpRequestOptions {
  method: SapHttpMethod;
  url: string;
  body?: unknown;
  headers?: Record<string, string>;
  verifySsl: boolean;
}

/**
 * Socket inactivity timeout for a single Service Layer request.
 *
 * Without this a hung SAP connection blocks until the platform kills the whole
 * function — and `withSapSyncLock` is left holding a promise that never settles, so
 * the in-memory lock wedges until the server restarts. Inactivity (not total
 * duration) is the right primitive: a legitimately slow large page keeps sending
 * data and must not be cut off.
 */
const DEFAULT_TIMEOUT_MS = 60_000;

function requestTimeoutMs(): number {
  const raw = process.env.SAP_REQUEST_TIMEOUT_MS;
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

export interface SapHttpResponse {
  statusCode: number;
  body: string;
  headers: IncomingHttpHeaders;
  /** Cookie header value built from Set-Cookie (name=value pairs). */
  cookieHeader: string | null;
}

/**
 * Extract name=value pairs from Set-Cookie header(s) for reuse as a Cookie header.
 */
export function parseSetCookieHeader(
  setCookie: string | string[] | undefined,
): string | null {
  if (!setCookie) return null;
  const raw = Array.isArray(setCookie) ? setCookie : [setCookie];
  const pairs: string[] = [];
  for (const cookie of raw) {
    const first = cookie.split(";")[0]?.trim();
    if (first) pairs.push(first);
  }
  return pairs.length > 0 ? pairs.join("; ") : null;
}

function requestOnce(options: SapHttpRequestOptions): Promise<SapHttpResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(options.url);
    const isHttps = url.protocol === "https:";
    const requestFn = isHttps ? httpsRequest : httpRequest;
    const hasBody =
      options.body !== undefined &&
      options.method !== "GET" &&
      options.method !== "DELETE";
    const bodyStr = hasBody ? JSON.stringify(options.body ?? {}) : undefined;

    const headers: Record<string, string> = {
      ...options.headers,
    };
    if (hasBody && bodyStr !== undefined) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = String(Buffer.byteLength(bodyStr));
    }

    const timeoutMs = requestTimeoutMs();

    const req = requestFn(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port ? Number(url.port) : undefined,
        path: `${url.pathname}${url.search}`,
        method: options.method,
        rejectUnauthorized: isHttps ? options.verifySsl : undefined,
        headers,
        timeout: timeoutMs,
      },
      (res) => {
        let responseBody = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          responseBody += chunk;
        });
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            body: responseBody,
            headers: res.headers,
            cookieHeader: parseSetCookieHeader(res.headers["set-cookie"]),
          });
        });
      },
    );

    // `timeout` only fires the event — the socket stays open until we destroy it.
    // Destroying with an explicit error routes through the `error` handler below.
    req.on("timeout", () => {
      req.destroy(
        new Error(
          `SAP did not respond for ${timeoutMs}ms (${options.method} ${url.pathname}).`,
        ),
      );
    });

    req.on("error", reject);
    if (bodyStr !== undefined) {
      req.write(bodyStr);
    }
    req.end();
  });
}

/**
 * Low-level SAP Service Layer HTTP helper.
 * When verifySsl is true and Node rejects a self-signed cert, retries once with verifySsl=false.
 */
export async function sapHttpRequest(
  options: SapHttpRequestOptions,
): Promise<SapHttpResponse> {
  try {
    return await requestOnce(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isSelfSignedError = /self[- ]signed certificate/i.test(message);
    if (!options.verifySsl || !isSelfSignedError) throw error;

    return requestOnce({ ...options, verifySsl: false });
  }
}
