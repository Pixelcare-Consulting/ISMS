import type { PrismaClient } from "@/lib/database/generated/prisma/client";
import { parsePsgBranchWorkbookFromPath } from "@/features/branches/services/psg-branch-workbook";
import { upsertPsgBranches } from "@/features/branches/services/psg-branch-upsert";

type SeedPrisma = Pick<
  PrismaClient,
  "branch" | "branchArea" | "branchQuota" | "brand" | "tenant"
>;

/** Load PSG ISMS workbook and upsert branches for every tenant. */
export async function seedPsgBranchesForAllTenants(prisma: SeedPrisma): Promise<void> {
  const parsed = await parsePsgBranchWorkbookFromPath();
  console.log(
    `  PSG workbook sheet "${parsed.sheetName}": ${parsed.rows.length} coded branches` +
      ` (skipped empty/- codes: ${parsed.skippedEmptyCode}, duplicate sap last-wins: ${parsed.duplicateSapCodeCount})`,
  );

  if (parsed.duplicateSapCodeCount > 0) {
    console.warn(
      `  Warning: ${parsed.duplicateSapCodeCount} duplicate BRANCH CODE row(s); last non-empty row wins.`,
    );
  }

  const tenants = await prisma.tenant.findMany({ select: { id: true, slug: true } });
  for (const tenant of tenants) {
    const result = await upsertPsgBranches(prisma, tenant.id, parsed.rows);
    console.log(
      `  Branches [${tenant.slug}]: +${result.branchesCreated} created, ${result.branchesUpdated} updated,` +
        ` ${result.areasUpserted} areas, ${result.quotasUpserted} quotas`,
    );
  }
}

/** Upsert PSG branches for a single tenant (e.g. after demo BRS brands exist). */
export async function seedPsgBranchesForTenant(
  prisma: SeedPrisma,
  tenantId: string,
): Promise<void> {
  const parsed = await parsePsgBranchWorkbookFromPath();
  if (parsed.duplicateSapCodeCount > 0) {
    console.warn(
      `  Warning: ${parsed.duplicateSapCodeCount} duplicate BRANCH CODE row(s); last non-empty row wins.`,
    );
  }
  const result = await upsertPsgBranches(prisma, tenantId, parsed.rows);
  console.log(
    `  Branches: +${result.branchesCreated} created, ${result.branchesUpdated} updated,` +
      ` ${result.areasUpserted} areas, ${result.quotasUpserted} quotas`,
  );
}
