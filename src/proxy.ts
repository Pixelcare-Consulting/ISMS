import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Deny-by-default: every route requires auth except those listed here, so new
// app sections are protected automatically.
const PUBLIC_PATHS = new Set(["/", "/login", "/register"]);

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.has(pathname);
  const sessionCookie = getSessionCookie(request);
  const isLoggedIn = Boolean(sessionCookie);

  if (!isPublic && !isLoggedIn) {
    const loginUrl = new URL("/login", request.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isLoggedIn && (pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL("/dashboard", request.nextUrl.origin));
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except Next internals, auth API, and static asset files.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)"],
};
