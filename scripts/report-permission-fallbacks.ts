/**
 * Read-only report: which roles lost an action when the permission fallbacks were removed.
 *
 * For every tenant and role, lists each action the role could only do through a fallback
 * (see `scripts/permission-fallbacks.ts`), the checkbox that now grants it, and the slug
 * that used to. Tick that checkbox in Settings → Roles if the role should keep the action.
 *
 * Changes nothing in the database. Safe to run on UAT and production.
 *
 * Usage: pnpm run db:report:permission-fallbacks
 */
import { createPrismaClient } from "../src/lib/database/create-prisma-client";
import { lostActions } from "./permission-fallbacks";

async function main() {
  const prisma = createPrismaClient();
  try {
    const roles = await prisma.role.findMany({
      where: { deletedAt: null, tenant: { deletedAt: null } },
      orderBy: [{ tenant: { name: "asc" } }, { name: "asc" }],
      select: {
        name: true,
        slug: true,
        tenant: { select: { name: true } },
        _count: { select: { userRoles: true } },
        rolePermissions: { select: { permission: { select: { slug: true } } } },
      },
    });

    let affected = 0;
    let currentTenant = "";
    for (const role of roles) {
      const lost = lostActions(role.rolePermissions.map((row) => row.permission.slug));
      if (lost.length === 0) continue;
      affected += 1;
      if (role.tenant.name !== currentTenant) {
        currentTenant = role.tenant.name;
        console.log(`\n=== ${currentTenant}`);
      }
      console.log(`\n${role.name} (${role.slug}), ${role._count.userRoles} user(s)`);
      for (const item of lost) {
        console.log(`  - ${item.action}: tick ${item.needs[0]} (was via ${item.via.join(", ")})`);
      }
    }

    console.log(
      affected === 0
        ? "No role lost an action."
        : `\n${affected} role(s) lost at least one action. Nothing was changed.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
