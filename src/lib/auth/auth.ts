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

async function loadUserPermissions(userId: string): Promise<string[]> {
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    include: {
      role: {
        include: {
          rolePermissions: {
            include: { permission: true },
          },
        },
      },
    },
  });

  const slugs = new Set<string>();
  for (const ur of userRoles) {
    for (const rp of ur.role.rolePermissions) {
      slugs.add(rp.permission.slug);
    }
  }
  return Array.from(slugs);
}

async function loadUserRoleSlugs(userId: string): Promise<string[]> {
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    include: { role: { select: { slug: true } } },
  });

  return userRoles.map((userRole) => userRole.role.slug);
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

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  secret: authSecret,
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.AUTH_URL,
  emailAndPassword: {
    enabled: true,
    password: {
      hash: async (password) => bcrypt.hash(password, 12),
      verify: async ({ hash, password }) => bcrypt.compare(password, hash),
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
  trustedOrigins: process.env.BETTER_AUTH_URL
    ? [process.env.BETTER_AUTH_URL]
    : undefined,
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
