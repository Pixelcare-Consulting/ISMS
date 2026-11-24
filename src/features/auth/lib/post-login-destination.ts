import {
  SETUP_HOME,
  isSetupPathAllowed,
  isTenantSetupAdmin,
} from "@/features/roles/constants/setup-access";

/**
 * First folder of a real page. A callback is kept only when it starts here,
 * so a scanner path cannot be stored and opened after sign-in.
 */
const APP_SECTIONS = new Set([
  "announcements",
  "audit-logs",
  "competitors",
  "dashboard",
  "help",
  "internal",
  "inventory",
  "logistics",
  "maintenance",
  "operations",
  "orders",
  "planning",
  "policies",
  "provider",
  "reports",
  "returns",
  "sales",
  "service-centers",
  "settings",
  "setup",
]);

/** Secret files from the login scanner burst that do not start with a dot. */
const PROBE_FILE_NAMES = new Set(["backup.sql", "laravel.log", "readme.bak"]);

type CallbackVerdict = "safe" | "unsafe" | "probe";

function pathOnly(value: string): string {
  const cut = value.search(/[?#]/);
  return cut === -1 ? value : value.slice(0, cut);
}

function hasScheme(pathname: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(pathname);
}

/** One extra decode pass, then a second, so %252e is visible as a dot. */
function decodedPathnames(pathname: string): { paths: string[]; broken: boolean } {
  const paths = [pathname];
  let current = pathname;
  for (let round = 0; round < 2; round += 1) {
    try {
      const decoded = pathOnly(decodeURIComponent(current));
      if (decoded === current) break;
      paths.push(decoded);
      current = decoded;
    } catch {
      return { paths, broken: true };
    }
  }
  return { paths, broken: false };
}

function firstSegment(pathname: string): string | undefined {
  return pathname.split("/").filter((part) => part.length > 0)[0];
}

/**
 * True when a segment is a dotfile, a traversal segment, an encoded dot
 * (%2e / %252e and further %25 wraps), or a named secret file.
 */
function isProbeSegment(segment: string): boolean {
  const trimmed = segment.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith(".") || /^(?:%25)*%2e/i.test(trimmed)) return true;
  return PROBE_FILE_NAMES.has(trimmed.toLowerCase());
}

function hidesSecretFile(pathname: string): boolean {
  if (pathname.includes("\\") || /%5c/i.test(pathname)) return true;
  return pathname
    .split(/[/\\]+/)
    .some((segment) => isProbeSegment(segment));
}

/**
 * Safe: one leading slash, a real app folder, no traversal, no backslash,
 * and no encoded dot that hides a file.
 * Probe: a secret-file path the proxy must answer with 404.
 * Unsafe: everything else, including https:// and //.
 */
function classifyInternalCallback(value: string | null | undefined): CallbackVerdict {
  if (!value) return "unsafe";
  const pathname = pathOnly(value);
  if (!pathname || hasScheme(pathname) || pathname.startsWith("//")) return "unsafe";

  const { paths, broken } = decodedPathnames(pathname);
  if (paths.some((path) => hidesSecretFile(path))) return "probe";
  if (broken) return "unsafe";
  if (!pathname.startsWith("/") || pathname.includes("//")) return "unsafe";
  if (paths.some((path) => /[\u0000-\u001f\u007f]/.test(path))) return "unsafe";
  if (paths.some((path) => !path.startsWith("/") || path.startsWith("//") || path.includes("//"))) {
    return "unsafe";
  }

  const folder = firstSegment(pathname);
  if (!folder || !APP_SECTIONS.has(folder)) return "unsafe";
  if (paths.some((path) => firstSegment(path) !== folder)) return "unsafe";
  return "safe";
}

/** Only a real in-app path. Probes and off-site URLs are dropped. */
export function safeInternalPath(callbackUrl: string | null | undefined): string | null {
  if (!callbackUrl || classifyInternalCallback(callbackUrl) !== "safe") return null;
  return callbackUrl;
}

/** Secret-file probe. The proxy answers 404 and does not send the browser to login. */
export function isLoginProbePath(callbackUrl: string | null | undefined): boolean {
  return classifyInternalCallback(callbackUrl) === "probe";
}

/** Path only, so a query or hash does not hide an allowed setup screen. */
function callbackPathname(callback: string): string {
  const path = callback.split(/[?#]/, 1)[0] ?? callback;
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

/**
 * Where to send the user after email/password sign-in.
 * Platform operators always land in the provider console unless the callback
 * is already under `/provider`. A tenant super admin lands on Setup, and a
 * callback is kept only when that account may open it.
 */
export function resolvePostLoginDestination(input: {
  isPlatformOperator: boolean;
  roleSlugs?: string[];
  callbackUrl?: string | null;
}): string {
  const safeCallback = safeInternalPath(input.callbackUrl);

  if (input.isPlatformOperator) {
    if (safeCallback?.startsWith("/provider")) {
      return safeCallback;
    }
    return "/provider";
  }

  if (
    isTenantSetupAdmin({
      roleSlugs: input.roleSlugs,
      isPlatformOperator: input.isPlatformOperator,
    })
  ) {
    if (safeCallback && isSetupPathAllowed(callbackPathname(safeCallback))) {
      return safeCallback;
    }
    return SETUP_HOME;
  }

  return safeCallback ?? "/dashboard";
}

/**
 * Poll until `read` returns a value. Used after client sign-in, when the
 * browser may not have committed Set-Cookie before the next request.
 */
export async function waitForValue<T>(
  read: () => Promise<T | null | undefined>,
  delaysMs: readonly number[] = [0, 40, 80, 160],
): Promise<T | null> {
  for (const delayMs of delaysMs) {
    if (delayMs > 0) {
      await new Promise((resolve) => {
        setTimeout(resolve, delayMs);
      });
    }
    const value = await read();
    if (value) return value;
  }
  return null;
}
