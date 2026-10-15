import type { PrismaClient } from "@prisma/client";

import {
  DEALER1_BRANCH_MAP,
  readPlanogramCsvContent,
} from "./seed-planogram-from-csv";
import { allocationService } from "@/features/forecast/services/allocation.service";
import {
  importForecastFromCsvContent,
  syncPlanogramFromCsvContent,
  upsertModelsFromPlanogramRows,
} from "@/features/planogram/services/planogram-csv-sync.service";
import { parsePlanogramCsvFromContent } from "./seed-planogram-from-csv";

export async function seedBrsDemoData(
  prisma: PrismaClient,
  tenantId: string,
  userIdsByEmail: Record<string, { id: string }>,
) {
  const csvContent = readPlanogramCsvContent();
  const planogramRows = parsePlanogramCsvFromContent(csvContent);

  const area = await prisma.area.upsert({
    where: { tenantId_code: { tenantId, code: "NCR" } },
    create: { tenantId, code: "NCR", name: "National Capital Region" },
    update: {},
  });

  const brandRecords = new Map<string, { id: string; code: string }>();
  for (const brandName of [...new Set(planogramRows.map((r) => r.brand))]) {
    const code = brandName.slice(0, 4).toUpperCase();
    const brand = await prisma.brand.upsert({
      where: { tenantId_name: { tenantId, name: brandName } },
      create: { tenantId, name: brandName, code },
      update: {},
    });
    brandRecords.set(brandName, { id: brand.id, code: brand.code ?? code });
  }

  const seriesRecords = new Map<string, string>();
  async function getSeriesId(brandName: string, series: string) {
    const key = `${brandName}:${series}`;
    if (seriesRecords.has(key)) return seriesRecords.get(key)!;

    const seriesName = series || "General";
    const seriesRow = await prisma.series.upsert({
      where: { tenantId_name: { tenantId, name: seriesName } },
      create: { tenantId, name: seriesName },
      update: {},
    });
    seriesRecords.set(key, seriesRow.id);
    return seriesRow.id;
  }

  const modelIdBySku = await upsertModelsFromPlanogramRows(
    prisma,
    tenantId,
    planogramRows,
    brandRecords,
    getSeriesId,
  );

  const mainWarehouse = await prisma.warehouse.upsert({
    where: { tenantId_code: { tenantId, code: "PASIG-MAIN" } },
    create: { tenantId, code: "PASIG-MAIN", name: "Pasig Main Warehouse", isMain: true },
    update: {},
  });

  await prisma.warehouseLocation.upsert({
    where: { warehouseId_code: { warehouseId: mainWarehouse.id, code: "A1" } },
    create: { warehouseId: mainWarehouse.id, code: "A1", name: "Aisle 1" },
    update: {},
  });

  const branchRecords: { id: string; sapCode: string; name: string; branchIndex: 1 | 2 | 3 | 4 }[] =
    [];
  const branchByIndex = new Map<1 | 2 | 3 | 4, string>();

  for (const branchDef of DEALER1_BRANCH_MAP) {
    const schedule =
      branchDef.branchIndex === 1
        ? { days: ["Tue", "Thu"] }
        : branchDef.branchIndex === 2
          ? { days: ["Mon", "Wed", "Fri"] }
          : branchDef.branchIndex === 3
            ? { days: ["Tue", "Fri"] }
            : { days: ["Wed", "Sat"] };

    const branch = await prisma.branch.upsert({
      where: { tenantId_sapCode: { tenantId, sapCode: branchDef.sapCode } },
      create: {
        tenantId,
        sapCode: branchDef.sapCode,
        name: branchDef.name,
        branchAreaId: area.id,
        deliverySchedule: schedule,
        status: "active",
      },
      update: { name: branchDef.name, deliverySchedule: schedule },
    });

    branchRecords.push({
      id: branch.id,
      sapCode: branchDef.sapCode,
      name: branchDef.name,
      branchIndex: branchDef.branchIndex,
    });
    branchByIndex.set(branchDef.branchIndex, branch.id);

  }

  // Link each branch to the next as an alternate fulfillment branch (demo).
  for (let i = 0; i < branchRecords.length; i++) {
    const current = branchRecords[i];
    const alternate = branchRecords[(i + 1) % branchRecords.length];
    if (!current || !alternate || current.id === alternate.id) continue;
    await prisma.alternateWarehouse.upsert({
      where: {
        branchId_alternateBranchId: {
          branchId: current.id,
          alternateBranchId: alternate.id,
        },
      },
      create: { branchId: current.id, alternateBranchId: alternate.id },
      update: {},
    });
  }

  await syncPlanogramFromCsvContent(
    prisma,
    tenantId,
    csvContent,
    branchRecords,
    modelIdBySku,
  );

  const period = await importForecastFromCsvContent(prisma, tenantId, csvContent, branchByIndex);

  if (userIdsByEmail["sp@demo.local"]) {
    try {
      await allocationService.runAllocation(tenantId, period.id);
    } catch {
      // non-fatal during seed
    }
  }

  const makati = branchRecords.find((b) => b.sapCode === "WMK-001");
  const psUserId = userIdsByEmail["ps@demo.local"]?.id;
  const tlUserId = userIdsByEmail["tl@demo.local"]?.id;
  const spUserId = userIdsByEmail["sp@demo.local"]?.id;

  const aorCreates: { tenantId: string; userId: string; branchId: string }[] = [];
  if (makati && psUserId) {
    aorCreates.push({ tenantId, userId: psUserId, branchId: makati.id });
  }
  if (spUserId && makati) {
    aorCreates.push({ tenantId, userId: spUserId, branchId: makati.id });
  }
  if (tlUserId) {
    for (const branch of branchRecords) {
      aorCreates.push({ tenantId, userId: tlUserId, branchId: branch.id });
    }
  }

  if (aorCreates.length > 0) {
    await prisma.aor.createMany({ data: aorCreates, skipDuplicates: true });
  }

  // Demo BranchInventory / warehouse SN stock is not seeded here. Run
  // `pnpm run db:cleanup:demo-stock` to wipe leftover demo STK, and
  // `pnpm run db:seed:warehouse-inventory` only when warehouse-only UAT serials are needed.

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      name: "Finden Technology",
      tagline: "Your BRS inventory ops partner",
    },
  });

  console.log(
    `BRS seed: ${planogramRows.length} SKUs, ${branchRecords.length} branches, ${period.label} forecast targets`,
  );
}
