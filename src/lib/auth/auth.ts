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
 * Every Vercel deployment answers on its own hostname, so a single
 * `BETTER_AUTH_URL` cannot cover preview builds: Better Auth compares the
 * request `Origin` against `trustedOrigins` and rejects anything else with
 * `INVALID_ORIGIN`. Collect every host this deployment is legitimately
 * reachable on instead of trusting one hard-coded URL.
 *
 * `VERCEL_PROJECT_PRODUCTION_URL` - the project's production domain
 * `VERCEL_BRANCH_URL`             - stable per-branch alias (`…-git-develop-…`)
 * `VERCEL_URL`                    - unique per deployment
 *
 * Vercel exposes those three as bare hostnames, hence the scheme prefixing.
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

/**
 * Preview and custom-environment deployments have no fixed URL, so let Better
 * Auth infer the base URL from the incoming request. Production keeps the
 * explicit value so links generated off-request point at the real domain.
 */
const isNonProductionDeployment =
  Boolean(process.env.VERCEL_ENV) && process.env.VERCEL_ENV !== "production";

const authBaseUrl = isNonProductionDeployment ? undefined : configuredAuthUrl;

const authTrustedOrigins = [
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

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  secret: authSecret,
  baseURL: authBaseUrl,
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
  trustedOrigins: authTrustedOrigins.length > 0 ? authTrustedOrigins : undefined,
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
