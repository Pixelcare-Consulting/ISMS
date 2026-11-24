import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/client";

/**
 * Users who hold a checkbox through any active role. Used for workflow bells and
 * approver lists, so they follow Settings → Roles instead of a role name.
 */
export function holdsPermissionWhere(tenantId: string, slug: string): Prisma.UserWhereInput {
  return {
    tenantId,
    deletedAt: null,
    disabledAt: null,
    userRoles: {
      some: {
        role: {
          tenantId,
          deletedAt: null,
          rolePermissions: { some: { permission: { slug } } },
        },
      },
    },
  };
}

/**
 * Ids of users holding `slug`. With `aorBranchId`, only users whose area of responsibility
 * lists that branch (an explicit row, as approvers need), like the old Team Leader lookup.
 */
export async function listUserIdsWithPermission(
  tenantId: string,
  slug: string,
  options?: { aorBranchId?: string },
): Promise<string[]> {
  const where: Prisma.UserWhereInput = holdsPermissionWhere(tenantId, slug);
  if (options?.aorBranchId) {
    where.aors = { some: { tenantId, branchId: options.aorBranchId } };
  }
  const rows = await prisma.user.findMany({
    where,
    select: { id: true },
    orderBy: { id: "asc" },
  });
  return rows.map((row) => row.id);
}
