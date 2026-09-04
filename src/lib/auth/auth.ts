import { dash } from "@better-auth/infra";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { customSession } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import bcrypt from "bcryptjs";

import { isPlatformOperator as checkPlatformOperator } from "@/features/roles/constants/role.constants";
import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/shared/logger";
import { rateLimit } from "@/lib/cache/redis";

/**
 * Permission slugs granted to a user by any of their roles.
 *
 * Selects straight from `Permission` and expresses the user link as a relation
 * *filter*, not a nested `include`. Prisma compiles a filter into one statement with
 * EXISTS subqueries; a three-level `include` (userRole → role → rolePermission →
 * permission) fans out into four sequential queries instead. This runs on every
 * request and every server action, so those round trips were the app's single
 * largest fixed cost — see `docs/request-latency.md`.
 *
 * Role soft-deletion is deliberately not filtered here: the previous nested-include
 * version did not filter it either, and narrowing it is a permissions change, not a
 * performance one.
 */
async function loadUserPermissions(userId: string): Promise<string[]> {
  const permissions = await prisma.permission.findMany({
    where: {
      rolePermissions: {
        some: { role: { userRoles: { some: { userId } } } },
      },
    },
    select: { slug: true },
  });

  // The query already returns each permission once, but roles may overlap in
  // principle — keep the de-duplication the Set gave us before.
  return Array.from(new Set(permissions.map((permission) => permission.slug)));
}

/** Role slugs held by a user. One flat query, same reasoning as above. */
async function loadUserRoleSlugs(userId: string): Promise<string[]> {
  const roles = await prisma.role.findMany({
    where: { userRoles: { some: { userId } } },
    select: { slug: true },
  });

  return roles.map((role) => role.slug);
}

async function loadTenantIsPlatform(tenantId: string): Promise<boolean> {
  if (!tenantId) return false;
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, deletedAt: null },
    select: { isPlatform: true },
  });
  return tenant?.isPlatform ?? false;
}

const authSecret =
  process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET ?? "";

/**
 * Better Auth compares the request `Origin` against `trustedOrigins` and
 * answers 403 `INVALID_ORIGIN` on a miss. Vercel serves one deployment on
 * several hostnames — the production domain, aliases such as
 * `isms-finden-dev.vercel.app`, the per-branch alias and the per-build URL —
 * and only some of them are knowable from environment variables.
 *
 * `VERCEL_PROJECT_PRODUCTION_URL` - the project's production domain
 * `VERCEL_BRANCH_URL`             - stable per-branch alias (`…-git-develop-…`)
 * `VERCEL_URL`                    - unique per deployment
 *
 * Vercel exposes those as bare hostnames, hence the scheme prefixing.
 */
function toOrigin(value: string | undefined): string | null {
  if (!value) return null;
  const withScheme = /^https?:\/\//.test(value) ? value : `https://${value}`;
  try {
    return new URL(withScheme).origin;
  } catch {
    return null;
  }
}

const configuredAuthUrl = process.env.BETTER_AUTH_URL ?? process.env.AUTH_URL;

const staticTrustedOrigins = [
  ...new Set(
    [
      configuredAuthUrl,
      process.env.NEXT_PUBLIC_APP_URL,
      process.env.VERCEL_PROJECT_PRODUCTION_URL,
      process.env.VERCEL_BRANCH_URL,
      process.env.VERCEL_URL,
    ]
      .map(toOrigin)
      .filter((origin): origin is string => origin !== null),
  ),
];

/**
 * Aliases assigned in the Vercel dashboard (the develop environment answers on
 * `isms-finden-dev.vercel.app`) appear in no environment variable, so the list
 * above cannot cover them. Trust the host the request was actually addressed to
 * as well: `Origin` is where a request came from, `Host` is where it was sent,
 * so a cross-site request still carries the attacker's `Origin` and is still
 * rejected. This only admits same-origin requests, and Vercel only routes
 * hostnames that belong to this project — CSRF protection stays intact.
 */
function resolveTrustedOrigins(request?: Request): string[] {
  const headers = request?.headers;
  const host = headers?.get("x-forwarded-host") ?? headers?.get("host");
  const protocol = headers?.get("x-forwarded-proto") ?? "https";
  const requestOrigin = toOrigin(host ? `${protocol}://${host}` : undefined);
  return requestOrigin
    ? [...staticTrustedOrigins, requestOrigin]
    : staticTrustedOrigins;
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  secret: authSecret,
  baseURL: configuredAuthUrl,
  emailAndPassword: {
    enabled: true,
    password: {
      hash: async (password) => bcrypt.hash(password, 12),
      verify: async ({ hash, password }) => bcrypt.compare(password, hash),
    },
  },
  session: {
    /**
     * Serve the base session from a signed cookie instead of re-reading `sessions`
     * and `users` on every request. Only the base lookup is cached — the
     * `customSession` plugin below still runs per request by design, so permissions
     * are never stale.
     *
     * Trade-off: a session revoked elsewhere stays usable for up to `maxAge`.
     * `requireAuth` still checks the user and tenant live on every call
     * (`lib/auth/permissions.ts`), so a disabled user or tenant is caught at once;
     * only remote sign-out lags, and only by a minute.
     */
    cookieCache: {
      enabled: true,
      maxAge: 60,
    },
  },
  user: {
    additionalFields: {
      tenantId: {
        type: "string",
        required: true,
        input: false,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (!("tenantId" in user) || !user.tenantId) {
            throw new Error("tenantId is required to create a user");
          }
          return { data: user };
        },
      },
    },
  },
  plugins: [
    customSession(async ({ user, session }) => {
      const tenantId = (user as { tenantId?: string }).tenantId ?? "";
      const [permissions, roleSlugs, tenantIsPlatform] = await Promise.all([
        loadUserPermissions(user.id),
        loadUserRoleSlugs(user.id),
        loadTenantIsPlatform(tenantId),
      ]);

      return {
        user: {
          ...user,
          tenantId,
          permissions,
          roleSlugs,
          isPlatformOperator: checkPlatformOperator(roleSlugs, tenantIsPlatform),
        },
        session,
      };
    }),
    dash({
      apiKey: process.env.BETTER_AUTH_API_KEY,
    }),
    nextCookies(),
  ],
  trustedOrigins: resolveTrustedOrigins,
});

export type AuthSession = typeof auth.$Infer.Session;

export async function assertLoginRateLimit(email: string, requestHeaders?: Headers) {
  const ip =
    requestHeaders?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { allowed } = await rateLimit(`login:${ip}:${email.toLowerCase()}`, 5, 300);
  if (!allowed) {
    throw new Error("Too many login attempts. Please try again in a few minutes.");
  }
}

export async function syncCredentialAccountPassword(
  userId: string,
  passwordHash: string,
) {
  const existing = await prisma.account.findFirst({
    where: { userId, providerId: "credential" },
  });

  if (existing) {
    await prisma.account.update({
      where: { id: existing.id },
      data: { password: passwordHash },
    });
    return;
  }

  await prisma.account.create({
    data: {
      userId,
      accountId: userId,
      providerId: "credential",
      password: passwordHash,
    },
  });
}

export function logAuthSignIn(userId: string) {
  logger.info({ userId }, "User signed in");
}
