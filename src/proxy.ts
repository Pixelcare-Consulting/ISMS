import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

import { MAINTENANCE_MODE, MAINTENANCE_PATH } from "@/config/maintenance";
import { isLoginProbePath, safeInternalPath } from "@/features/auth/lib/post-login-destination";
import { isTerminalLoginError } from "@/lib/auth/session-policy";

// Deny-by-default: every route requires auth except those listed here, so new
// app sections are protected automatically.
const PUBLIC_PATHS = new Set(["/", "/login", "/register"]);

// The maintenance page itself must stay reachable or the rewrite loops.
const MAINTENANCE_ALLOWLIST = [MAINTENANCE_PATH];

function handleMaintenance(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;

  if (!MAINTENANCE_MODE) {
    // Reopened: send anyone still parked on the maintenance page back in.
    return pathname === MAINTENANCE_PATH
      ? NextResponse.redirect(new URL("/", request.nextUrl.origin))
      : null;
  }

  if (MAINTENANCE_ALLOWLIST.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api")) {
    return NextResponse.json(
      { error: "The system is under maintenance. Please try again later." },
      { status: 503, headers: { "Retry-After": "3600" } },
    );
  }

  const url = request.nextUrl.clone();
  url.pathname = MAINTENANCE_PATH;
  url.search = "";
  return NextResponse.rewrite(url);
}

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const callbackUrl = request.nextUrl.searchParams.get("callbackUrl");

  // Probes are not pages. Do not redirect them to login or store them as callbackUrl.
  if (isLoginProbePath(pathname) || (pathname === "/login" && isLoginProbePath(callbackUrl))) {
    return new NextResponse(null, { status: 404 });
  }

  const maintenanceResponse = handleMaintenance(request);
  if (maintenanceResponse) return maintenanceResponse;

  const isPublic = PUBLIC_PATHS.has(pathname);
  const sessionCookie = getSessionCookie(request);
  const isLoggedIn = Boolean(sessionCookie);

  if (!isPublic && !isLoggedIn) {
    const loginUrl = new URL("/login", request.nextUrl.origin);
    const safeCallback = safeInternalPath(pathname);
    if (safeCallback) {
      loginUrl.searchParams.set("callbackUrl", safeCallback);
    }
    return NextResponse.redirect(loginUrl);
  }

  // A sign-out URL must render even when the session cookie is still in the
  // browser. Sending it to the app makes requireAuth sign out again and the
  // browser reloads the same login URL.
  const stayOnLogin =
    pathname === "/login" && isTerminalLoginError(request.nextUrl.searchParams.get("error"));
  if (isLoggedIn && (pathname === "/login" || pathname === "/register") && !stayOnLogin) {
    return NextResponse.redirect(new URL("/dashboard", request.nextUrl.origin));
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);
  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  // Run on everything except Next internals, auth API, cron (bearer-authenticated
  // server-to-server calls that must survive maintenance), the container
  // health probe, and static asset files.
  matcher: [
    "/((?!api/auth|api/cron|api/health|_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)",
  ],
};
