import type { NextAuthConfig } from "next-auth";

/** Edge-safe config (no Prisma). Used by proxy. */
export const edgeAuthConfig = {
  providers: [],
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isAppRoute =
        pathname.startsWith("/dashboard") ||
        pathname.startsWith("/settings");
      if (isAppRoute) return !!auth;
      return true;
    },
  },
  trustHost: true,
} satisfies NextAuthConfig;
