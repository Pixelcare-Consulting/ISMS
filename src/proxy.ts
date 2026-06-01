import NextAuth from "next-auth";

import { edgeAuthConfig } from "@/lib/auth/auth.config";

const { auth } = NextAuth({
  ...edgeAuthConfig,
  secret: process.env.AUTH_SECRET,
});

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;

  const isAppRoute =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/policies") ||
    pathname.startsWith("/inventory") ||
    pathname.startsWith("/orders") ||
    pathname.startsWith("/logistics") ||
    pathname.startsWith("/sales");

  if (isAppRoute && !isLoggedIn) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return Response.redirect(loginUrl);
  }

  if (isLoggedIn && (pathname === "/login" || pathname === "/register")) {
    return Response.redirect(new URL("/dashboard", req.nextUrl.origin));
  }
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/settings/:path*",
    "/policies/:path*",
    "/inventory/:path*",
    "/orders/:path*",
    "/logistics/:path*",
    "/sales/:path*",
    "/login",
    "/register",
  ],
};
