import type { PrismaClient } from "@/lib/database/generated/prisma/client";
import {
  PH_REGION_PROVINCES,
  uniquePhRegionNames,
} from "@/features/lookups/constants/ph-region-provinces";

type SeedPrisma = Pick<PrismaClient, "region" | "province" | "tenant">;

/** Upsert Regions + Provinces for one tenant (idempotent; re-links regionId). */
export async function seedRegionsAndProvinces(
  prisma: SeedPrisma,
  tenantId: string,
): Promise<{ regions: number; provinces: number }> {
  const regionNames = uniquePhRegionNames();
  const regionIdByName = new Map<string, string>();

  for (const name of regionNames) {
    const region = await prisma.region.upsert({
      where: { tenantId_name: { tenantId, name } },
      create: { tenantId, name, recordStatus: "active" },
      update: { recordStatus: "active" },
      select: { id: true, name: true },
    });
    regionIdByName.set(region.name, region.id);
  }

  for (const { region, province } of PH_REGION_PROVINCES) {
    const regionId = regionIdByName.get(region);
    if (!regionId) continue;

    await prisma.province.upsert({
      where: { tenantId_name: { tenantId, name: province } },
      create: {
        tenantId,
        name: province,
        regionId,
        recordStatus: "active",
      },
      update: {
        regionId,
        recordStatus: "active",
      },
    });
  }

  return { regions: regionNames.length, provinces: PH_REGION_PROVINCES.length };
}

/** Idempotent geo seed for every tenant in the database. */
export async function seedRegionsAndProvincesForAllTenants(
  prisma: SeedPrisma,
): Promise<void> {
  const tenants = await prisma.tenant.findMany({ select: { id: true, slug: true } });
  for (const tenant of tenants) {
    const result = await seedRegionsAndProvinces(prisma, tenant.id);
    console.log(
      `  Geo [${tenant.slug}]: ${result.regions} regions, ${result.provinces} provinces`,
    );
  }
}
