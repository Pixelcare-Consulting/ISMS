import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import {
  DEMO_PASSWORD,
  DEMO_USERS,
  DEPARTMENTS,
  PERMISSIONS,
  PLATFORM_PROVIDER_USER,
  PLATFORM_TENANT,
  ROLES,
  USER_DEPARTMENTS,
} from "./seed-data";

/** Dev-only: lower bcrypt cost speeds re-seed (see database/seed-users.md). */
const BCRYPT_ROUNDS = Number(process.env.SEED_BCRYPT_ROUNDS ?? 8);

export interface CoreSeedResult {
  demoTenant: { id: string; slug: string };
  platformTenant: { id: string; slug: string };
  usersByEmail: Record<string, { id: string }>;
}

/**
 * Additive core seed — creates missing demo rows only.
 * Does not delete tenants/users/roles/data, and does not overwrite existing
 * passwords or custom role-permission grants already in the DB.
 */
export async function seedCore(prisma: PrismaClient): Promise<CoreSeedResult> {
  await Promise.all(
    PERMISSIONS.map((perm) =>
      prisma.permission.upsert({
        where: { slug: perm.slug },
        create: perm,
        update: { name: perm.name },
      }),
    ),
  );

  const permissionRecords = await prisma.permission.findMany({
    where: { slug: { in: PERMISSIONS.map((p) => p.slug) } },
  });
  const permissionBySlug = Object.fromEntries(permissionRecords.map((p) => [p.slug, p]));

  const demoTenant = await prisma.tenant.upsert({
    where: { slug: "demo" },
    create: {
      name: "Finden Technology",
      slug: "demo",
      tagline: "BRS inventory ops + ISMS compliance",
      isPlatform: false,
    },
    // Preserve any local renames / tagline edits
    update: {},
  });

  const platformTenant = await prisma.tenant.upsert({
    where: { slug: PLATFORM_TENANT.slug },
    create: {
      name: PLATFORM_TENANT.name,
      slug: PLATFORM_TENANT.slug,
      tagline: PLATFORM_TENANT.tagline,
      isPlatform: true,
    },
    update: {
      isPlatform: true,
      name: PLATFORM_TENANT.name,
      tagline: PLATFORM_TENANT.tagline,
    },
  });

  const platformSuperAdminRole = await prisma.role.upsert({
    where: {
      tenantId_slug: { tenantId: platformTenant.id, slug: "super_admin" },
    },
    create: {
      tenantId: platformTenant.id,
      slug: "super_admin",
      name: "Super Admin",
      description: "Platform operator",
      isSystem: true,
    },
    update: {
      name: "Super Admin",
      description: "Platform operator",
      isSystem: true,
    },
  });

  const allPermissionIds = permissionRecords
    .map((p) => p.id)
    .filter((id): id is string => Boolean(id));
  if (allPermissionIds.length > 0) {
    await prisma.rolePermission.createMany({
      data: allPermissionIds.map((permissionId) => ({
        roleId: platformSuperAdminRole.id,
        permissionId,
      })),
      skipDuplicates: true,
    });
  }

  const departmentsByName: Record<string, { id: string }> = {};
  await Promise.all(
    DEPARTMENTS.map(async (departmentName) => {
      const department = await prisma.department.upsert({
        where: { tenantId_name: { tenantId: demoTenant.id, name: departmentName } },
        create: { tenantId: demoTenant.id, name: departmentName },
        update: {},
      });
      departmentsByName[departmentName] = department;
    }),
  );

  const rolesBySlug: Record<string, { id: string }> = {};
  await Promise.all(
    ROLES.map(async (roleDef) => {
      const role = await prisma.role.upsert({
        where: { tenantId_slug: { tenantId: demoTenant.id, slug: roleDef.slug } },
        create: {
          tenantId: demoTenant.id,
          slug: roleDef.slug,
          name: roleDef.name,
          description: roleDef.description,
          isSystem: true,
        },
        update: { name: roleDef.name, description: roleDef.description },
      });
      rolesBySlug[roleDef.slug] = role;

      const permissionIds = roleDef.permissions
        .map((slug) => permissionBySlug[slug]?.id)
        .filter((id): id is string => Boolean(id));

      // Add missing grants only — never wipe custom permissions on system roles
      if (permissionIds.length > 0) {
        await prisma.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
          skipDuplicates: true,
        });
      }
    }),
  );

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);
  const usersByEmail: Record<string, { id: string }> = {};

  await Promise.all(
    DEMO_USERS.map(async (userDef) => {
      const departmentName = USER_DEPARTMENTS[userDef.email];
      const department = departmentName ? departmentsByName[departmentName] : undefined;

      const user = await prisma.user.upsert({
        where: { tenantId_email: { tenantId: demoTenant.id, email: userDef.email } },
        create: {
          tenantId: demoTenant.id,
          email: userDef.email,
          name: userDef.name,
          passwordHash,
          emailVerified: true,
          departmentId: department?.id ?? null,
        },
        // Keep existing name / password / department — seed must not clobber DB users
        update: {},
      });
      usersByEmail[userDef.email] = user;

      const credentialAccount = await prisma.account.findFirst({
        where: { userId: user.id, providerId: "credential" },
      });
      if (!credentialAccount) {
        // Backfill Better Auth credential row using the user's current hash
        await prisma.account.create({
          data: {
            userId: user.id,
            accountId: user.id,
            providerId: "credential",
            password: user.passwordHash || passwordHash,
          },
        });
      }

      const role = rolesBySlug[userDef.roleSlug];
      if (!role) return;

      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        create: { userId: user.id, roleId: role.id },
        update: {},
      });
    }),
  );

  const providerUser = await prisma.user.upsert({
    where: {
      tenantId_email: {
        tenantId: platformTenant.id,
        email: PLATFORM_PROVIDER_USER.email,
      },
    },
    create: {
      tenantId: platformTenant.id,
      email: PLATFORM_PROVIDER_USER.email,
      name: PLATFORM_PROVIDER_USER.name,
      passwordHash,
      emailVerified: true,
    },
    update: {},
  });
  usersByEmail[PLATFORM_PROVIDER_USER.email] = providerUser;

  const providerCredential = await prisma.account.findFirst({
    where: { userId: providerUser.id, providerId: "credential" },
  });
  if (!providerCredential) {
    await prisma.account.create({
      data: {
        userId: providerUser.id,
        accountId: providerUser.id,
        providerId: "credential",
        password: providerUser.passwordHash || passwordHash,
      },
    });
  }

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: providerUser.id,
        roleId: platformSuperAdminRole.id,
      },
    },
    create: {
      userId: providerUser.id,
      roleId: platformSuperAdminRole.id,
    },
    update: {},
  });

  return { demoTenant, platformTenant, usersByEmail };
}
