import NextAuth from "next-auth";

import { edgeAuthConfig } from "@/lib/auth/auth.config";

const { auth } = NextAuth({
  ...edgeAuthConfig,
  secret: process.env.AUTH_SECRET,
});

// Deny-by-default: every route requires auth except those listed here, so new
// app sections are protected automatically.
const PUBLIC_PATHS = new Set(["/", "/login", "/register"]);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.has(pathname);

  if (!isPublic && !isLoggedIn) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return Response.redirect(loginUrl);
  }

  if (isLoggedIn && (pathname === "/login" || pathname === "/register")) {
    return Response.redirect(new URL("/dashboard", req.nextUrl.origin));
  }
});

export const config = {
  // Run on everything except Next internals, auth API, and static asset files.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)"],
};
