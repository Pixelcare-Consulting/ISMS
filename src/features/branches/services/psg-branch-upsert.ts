import type { PrismaClient } from "@/lib/database/generated/prisma/client";
import type { PsgBranchRow } from "@/features/branches/services/psg-branch-workbook";

type SeedPrisma = Pick<
  PrismaClient,
  "branch" | "branchArea" | "branchQuota" | "brand" | "tenant"
>;

export interface UpsertPsgBranchesResult {
  areasUpserted: number;
  branchesCreated: number;
  branchesUpdated: number;
  quotasUpserted: number;
}

const CHUNK = 40;

function startOfCurrentMonthUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function findBrandId(
  brands: { id: string; name: string }[],
  needle: string,
): string | null {
  const lower = needle.toLowerCase();
  const exact = brands.find((b) => b.name.toLowerCase() === lower);
  if (exact) return exact.id;
  const starts = brands.find((b) => b.name.toLowerCase().startsWith(lower));
  return starts?.id ?? null;
}

/**
 * Upsert BranchArea + Branch (+ current-month quotas for Devant / Hisense when brands exist).
 * Does not overwrite dealerId / primaryWarehouseId / regionId / provinceId when already set.
 */
export async function upsertPsgBranches(
  prisma: SeedPrisma,
  tenantId: string,
  rows: PsgBranchRow[],
): Promise<UpsertPsgBranchesResult> {
  const areaNames = [
    ...new Set(
      rows
        .map((row) => row.areaName)
        .filter((name): name is string => Boolean(name)),
    ),
  ];

  const areaIdByName = new Map<string, string>();
  for (const name of areaNames) {
    const area = await prisma.branchArea.upsert({
      where: { tenantId_name: { tenantId, name } },
      create: { tenantId, name, recordStatus: "active" },
      update: { recordStatus: "active" },
      select: { id: true, name: true },
    });
    areaIdByName.set(area.name, area.id);
  }

  const brands = await prisma.brand.findMany({
    where: { tenantId },
    select: { id: true, name: true },
  });
  const devantBrandId = findBrandId(brands, "Devant");
  const hisenseBrandId = findBrandId(brands, "Hisense");
  const quotaDate = startOfCurrentMonthUtc();

  let branchesCreated = 0;
  let branchesUpdated = 0;
  let quotasUpserted = 0;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);

    for (const row of chunk) {
      const branchAreaId = row.areaName ? (areaIdByName.get(row.areaName) ?? null) : null;

      const existing = await prisma.branch.findUnique({
        where: { tenantId_sapCode: { tenantId, sapCode: row.sapCode } },
        select: {
          id: true,
          dealerId: true,
          primaryWarehouseId: true,
          regionId: true,
          provinceId: true,
          name: true,
          status: true,
          branchAreaId: true,
        },
      });

      let branchId: string;

      if (!existing) {
        const created = await prisma.branch.create({
          data: {
            tenantId,
            sapCode: row.sapCode,
            name: row.name,
            status: row.status,
            branchAreaId,
          },
          select: { id: true },
        });
        branchId = created.id;
        branchesCreated += 1;
      } else {
        await prisma.branch.update({
          where: { id: existing.id },
          data: {
            name: row.name,
            status: row.status,
            ...(branchAreaId ? { branchAreaId } : {}),
            // Preserve dealer / warehouse / region / province when already set.
          },
        });
        branchId = existing.id;
        branchesUpdated += 1;
      }

      const quotaPairs: { brandId: string; amount: number }[] = [];
      if (devantBrandId && row.devantQuota != null) {
        quotaPairs.push({ brandId: devantBrandId, amount: row.devantQuota });
      }
      if (hisenseBrandId && row.hisenseQuota != null) {
        quotaPairs.push({ brandId: hisenseBrandId, amount: row.hisenseQuota });
      }

      for (const { brandId, amount } of quotaPairs) {
        await prisma.branchQuota.upsert({
          where: {
            branchId_brandId_quotaDate: {
              branchId,
              brandId,
              quotaDate,
            },
          },
          create: {
            tenantId,
            branchId,
            brandId,
            quotaDate,
            quotaAmount: amount,
          },
          update: {
            quotaAmount: amount,
          },
        });
        quotasUpserted += 1;
      }
    }
  }

  return {
    areasUpserted: areaNames.length,
    branchesCreated,
    branchesUpdated,
    quotasUpserted,
  };
}
