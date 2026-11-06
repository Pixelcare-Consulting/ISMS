import type { PrismaClient } from "@prisma/client";

import { TEST_ACCOUNT_BRANCH_AORS } from "./seed-data";

/**
 * Adds the test accounts' branch assignments. Only adds rows, so existing AORs stay, and it
 * can run again. A branch or account this database does not have is skipped and logged.
 */
export async function seedTestAccountAors(
  prisma: PrismaClient,
  tenantId: string,
  usersByEmail: Record<string, { id: string }>,
): Promise<void> {
  const sapCodes = [...new Set(TEST_ACCOUNT_BRANCH_AORS.flatMap((row) => row.branchSapCodes))];
  const branches = await prisma.branch.findMany({
    where: { tenantId, sapCode: { in: sapCodes }, deletedAt: null },
    select: { id: true, sapCode: true },
  });
  const branchIdByCode = new Map(branches.map((branch) => [branch.sapCode, branch.id]));

  for (const { email, branchSapCodes } of TEST_ACCOUNT_BRANCH_AORS) {
    const user = usersByEmail[email];
    if (!user) {
      console.warn(`Skipping ${email}: account not found`);
      continue;
    }
    for (const sapCode of branchSapCodes) {
      const branchId = branchIdByCode.get(sapCode);
      if (!branchId) {
        console.warn(`Skipping ${email} at ${sapCode}: branch not found`);
        continue;
      }
      const existing = await prisma.aor.findFirst({
        where: { tenantId, userId: user.id, branchId },
        select: { id: true },
      });
      if (existing) continue;
      await prisma.aor.create({
        data: { tenantId, userId: user.id, branchId, status: "active" },
      });
    }
  }
}
