/**
 * One-time grant for a database that is already deployed.
 *
 * Upserts `inventory.monthly_sir.view` ("View Monthly SIR") and inserts that
 * grant on every role, on every tenant, that already has `inventory.view`.
 * Inserts use skipDuplicates (ON CONFLICT DO NOTHING).
 *
 * Does not delete permissions. Does not change role names, users, passwords,
 * stock, or orders. Does not remove `orders.*`, `sales.return.*`, or
 * `service_centers.return.*`.
 *
 * Usage (once on the client server after deploy):
 *   pnpm run db:grant:monthly-sir
 *
 * Do not run `pnpm run db:seed` or `pnpm run db:seed:full` on that server.
 */
import { createPrismaClient } from "../src/lib/database/create-prisma-client";
import {
  INVENTORY_VIEW_SLUG,
  MONTHLY_SIR_VIEW_NAME,
  MONTHLY_SIR_VIEW_SLUG,
  roleIdsToGrantMonthlySir,
} from "./monthly-sir-grant";

async function main() {
  const prisma = createPrismaClient();
  try {
    const monthlySir = await prisma.permission.upsert({
      where: { slug: MONTHLY_SIR_VIEW_SLUG },
      create: { slug: MONTHLY_SIR_VIEW_SLUG, name: MONTHLY_SIR_VIEW_NAME },
      update: { name: MONTHLY_SIR_VIEW_NAME },
    });

    const holders = await prisma.rolePermission.findMany({
      where: { permission: { slug: INVENTORY_VIEW_SLUG } },
      select: {
        roleId: true,
        permission: { select: { slug: true } },
        role: { select: { tenantId: true } },
      },
    });

    const roleIds = roleIdsToGrantMonthlySir(
      holders.map((holder) => ({
        roleId: holder.roleId,
        permissionSlugs: [holder.permission.slug],
      })),
    );

    const inserted =
      roleIds.length === 0
        ? { count: 0 }
        : await prisma.rolePermission.createMany({
            data: roleIds.map((roleId) => ({
              roleId,
              permissionId: monthlySir.id,
            })),
            skipDuplicates: true,
          });

    const tenantCount = new Set(holders.map((holder) => holder.role.tenantId)).size;
    console.log(
      `Upserted ${MONTHLY_SIR_VIEW_SLUG} (${MONTHLY_SIR_VIEW_NAME}). ` +
        `Roles with ${INVENTORY_VIEW_SLUG}: ${roleIds.length} across ${tenantCount} tenant(s). ` +
        `New grants: ${inserted.count}. Existing grants were left in place.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
