import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/shared/logger";
import { isPlatformOperator as checkPlatformOperator } from "@/features/roles/constants/role.constants";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

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

async function findUserByEmailAndPassword(email: string, password: string) {
  const candidates = await prisma.user.findMany({
    where: {
      email: email.toLowerCase(),
      deletedAt: null,
    },
  });

  if (candidates.length === 0) {
    return null;
  }

  const matches = [];
  for (const candidate of candidates) {
    const valid = await bcrypt.compare(password, candidate.passwordHash);
    if (valid) {
      matches.push(candidate);
    }
  }

  if (matches.length !== 1) {
    return null;
  }

  return matches[0];
}

export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const { email, password } = parsed.data;
        const user = await findUserByEmailAndPassword(email, password);

        if (!user) return null;

        const [permissions, roleSlugs] = await Promise.all([
          loadUserPermissions(user.id),
          loadUserRoleSlugs(user.id),
        ]);

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
          tenantId: user.tenantId,
          permissions,
          roleSlugs,
          isPlatformOperator: checkPlatformOperator(roleSlugs),
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id!;
        token.tenantId = user.tenantId;
        token.permissions = user.permissions;
        token.roleSlugs = user.roleSlugs;
        token.isPlatformOperator = user.isPlatformOperator;
        token.name = user.name;
        return token;
      }

      if (trigger === "update" && session?.user) {
        if (session.user.name !== undefined) {
          token.name = session.user.name;
        }

        if (token.id) {
          const userId = token.id as string;
          token.permissions = await loadUserPermissions(userId);
          const loadedRoleSlugs = await loadUserRoleSlugs(userId);
          token.roleSlugs = loadedRoleSlugs;
          token.isPlatformOperator = checkPlatformOperator(loadedRoleSlugs);
        }

        return token;
      }

      // Backfill missing JWT fields only — avoid reloading permissions on every navigation.
      if (token.id && !Array.isArray(token.permissions)) {
        token.permissions = await loadUserPermissions(token.id as string);
      }

      if (
        token.id &&
        (!Array.isArray(token.roleSlugs) || token.roleSlugs.length === 0)
      ) {
        const loadedRoleSlugs = await loadUserRoleSlugs(token.id as string);
        token.roleSlugs = loadedRoleSlugs;
        token.isPlatformOperator = checkPlatformOperator(loadedRoleSlugs);
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.tenantId = token.tenantId as string;
        session.user.permissions = (token.permissions as string[]) ?? [];
        session.user.roleSlugs = (token.roleSlugs as string[]) ?? [];
        session.user.isPlatformOperator = Boolean(token.isPlatformOperator);
        session.user.name = token.name as string | undefined;
      }
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      logger.info({ userId: user.id }, "User signed in");
    },
  },
  trustHost: true,
};
