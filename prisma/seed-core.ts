import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import {
  DEMO_PASSWORD,
  DEMO_USERS,
  DEPARTMENTS,
  PERMISSIONS,
  ROLES,
  USER_DEPARTMENTS,
} from "./seed-data";

/** Dev-only: lower bcrypt cost speeds re-seed (see database/seed-users.md). */
const BCRYPT_ROUNDS = Number(process.env.SEED_BCRYPT_ROUNDS ?? 8);

export interface CoreSeedResult {
  demoTenant: { id: string; slug: string };
  usersByEmail: Record<string, { id: string }>;
}

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
    },
    update: {
      name: "Finden Technology",
      tagline: "BRS inventory ops + ISMS compliance",
    },
  });

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

      await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
      if (permissionIds.length > 0) {
        await prisma.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
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
          emailVerified: new Date(),
          departmentId: department?.id ?? null,
        },
        update: { name: userDef.name, passwordHash, departmentId: department?.id ?? null },
      });
      usersByEmail[userDef.email] = user;

      const role = rolesBySlug[userDef.roleSlug];
      if (!role) return;

      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        create: { userId: user.id, roleId: role.id },
        update: {},
      });
    }),
  );

  return { demoTenant, usersByEmail };
}
