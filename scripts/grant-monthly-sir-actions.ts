/**
 * One-time grant for a database that is already deployed.
 *
 * Upserts the Monthly SIR / P-COUNT action permissions and inserts each grant
 * on every role, on every tenant, that already qualifies:
 * - View holders receive Download template, Scan serials, Upload P-COUNT,
 *   Generate variance, and Open P-Count.
 * - View holders who also have Branch inventory Manage receive Approve.
 * Inserts use skipDuplicates (ON CONFLICT DO NOTHING).
 *
 * Does not delete permissions. Does not change role names, users, passwords,
 * stock, or orders. Does not grant View itself.
 *
 * Usage (once on the client server after deploy):
 *   pnpm exec dotenv -e .env.local -- tsx scripts/grant-monthly-sir-actions.ts
 *
 * Do not run `pnpm run db:seed` or `pnpm run db:seed:full` on that server.
 */
import { createPrismaClient } from "../src/lib/database/create-prisma-client";
import {
  INVENTORY_MANAGE_SLUG,
  MONTHLY_SIR_VIEW_SLUG,
} from "../src/features/monthly-sir/constants/monthly-sir-permissions";
import {
  MONTHLY_SIR_ACTION_GRANTS,
  roleIdsToGrantMonthlySirActions,
} from "./monthly-sir-actions-grant";

async function main() {
  const prisma = createPrismaClient();
  try {
    const permissions = [];
    for (const grant of MONTHLY_SIR_ACTION_GRANTS) {
      permissions.push(
        await prisma.permission.upsert({
          where: { slug: grant.slug },
          create: { slug: grant.slug, name: grant.name },
          update: { name: grant.name },
        }),
      );
    }

    const holderSlugs = [MONTHLY_SIR_VIEW_SLUG, INVENTORY_MANAGE_SLUG];
    const holders = await prisma.rolePermission.findMany({
      where: { permission: { slug: { in: holderSlugs } } },
      select: {
        roleId: true,
        permission: { select: { slug: true } },
        role: { select: { tenantId: true } },
      },
    });

    const slugsByRole = new Map<string, string[]>();
    const tenantByRole = new Map<string, string>();
    for (const holder of holders) {
      const slugs = slugsByRole.get(holder.roleId) ?? [];
      slugs.push(holder.permission.slug);
      slugsByRole.set(holder.roleId, slugs);
      tenantByRole.set(holder.roleId, holder.role.tenantId);
    }

    const plans = roleIdsToGrantMonthlySirActions(
      [...slugsByRole.entries()].map(([roleId, permissionSlugs]) => ({
        roleId,
        permissionSlugs,
      })),
    );
    const permissionIdBySlug = new Map(permissions.map((row) => [row.slug, row.id]));

    let inserted = 0;
    const tenantIds = new Set<string>();
    const counts: string[] = [];
    for (const plan of plans) {
      const permissionId = permissionIdBySlug.get(plan.slug);
      counts.push(`${plan.slug} ${plan.roleIds.length}`);
      if (!permissionId || plan.roleIds.length === 0) continue;
      for (const roleId of plan.roleIds) {
        const tenantId = tenantByRole.get(roleId);
        if (tenantId) tenantIds.add(tenantId);
      }
      const result = await prisma.rolePermission.createMany({
        data: plan.roleIds.map((roleId) => ({
          roleId,
          permissionId,
        })),
        skipDuplicates: true,
      });
      inserted += result.count;
    }

    console.log(
      `Upserted ${MONTHLY_SIR_ACTION_GRANTS.map((grant) => grant.slug).join(", ")}. ` +
        `Roles: ${counts.join("; ")} across ${tenantIds.size} tenant(s). ` +
        `New grants: ${inserted}. Existing grants were left in place.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
