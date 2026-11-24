/**
 * Read-only report for the workflow-step migration (20261124200000_workflow_step_permissions).
 *
 * For every tenant and role, lists:
 * - the step checkboxes the migration will tick (by role slug, as the rules worked before),
 * - roles that gain Branch transfers Approve: they already have the checkbox ticked, but
 *   until now only Team Leaders (and Super Admin) could approve. Untick it in
 *   Settings → Roles before deploying if they should not approve transfers.
 *
 * Changes nothing in the database. Safe to run on UAT and production.
 *
 * Usage: pnpm run db:report:step-permissions
 */
import { createPrismaClient } from "../src/lib/database/create-prisma-client";
import { plannedWorkflowStepGrants } from "../src/features/roles/constants/workflow-step-permissions";
import {
  ALL_BRANCHES_PERMISSION,
  TRANSFER_APPROVE_PERMISSION,
} from "../src/features/logistics/lib/transfer-approver";

/** Slugs that could approve transfers before (Team Leader for AOR branches, Super Admin for all). */
const PREVIOUS_TRANSFER_APPROVER_SLUGS = new Set(["tl", "super_admin"]);

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
      const held = role.rolePermissions.map((row) => row.permission.slug);
      const ticked = plannedWorkflowStepGrants(role.slug, held);
      const gainsTransferApprove =
        held.includes(TRANSFER_APPROVE_PERMISSION) &&
        !PREVIOUS_TRANSFER_APPROVER_SLUGS.has(role.slug);
      if (ticked.length === 0 && !gainsTransferApprove) continue;

      affected += 1;
      if (role.tenant.name !== currentTenant) {
        currentTenant = role.tenant.name;
        console.log(`\n=== ${currentTenant}`);
      }
      console.log(`\n${role.name} (${role.slug}), ${role._count.userRoles} user(s)`);
      for (const slug of ticked) {
        console.log(`  + ticked by migration: ${slug}`);
      }
      if (gainsTransferApprove) {
        const scope = held.includes(ALL_BRANCHES_PERMISSION)
          ? "every branch (has Manage branches)"
          : "branches in their area of responsibility";
        console.log(
          `  ! gains Branch transfers Approve for ${scope}. Untick it if they should not approve.`,
        );
      }
    }

    console.log(
      affected === 0
        ? "No role changes."
        : `\n${affected} role(s) listed. Nothing was changed.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
