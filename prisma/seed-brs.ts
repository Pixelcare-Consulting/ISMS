import type { PrismaClient } from "@prisma/client";

import type { ReasonStatusCodeMap } from "./seed-reason-status";
import { getReasonStatusCodeId } from "./seed-reason-status";
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
  statusCodes?: ReasonStatusCodeMap,
) {
  const resolveStatusCodeId = async (code: string) => {
    if (statusCodes?.inventory_system[code]) {
      return statusCodes.inventory_system[code];
    }
    return getReasonStatusCodeId(prisma, tenantId, "inventory_system", code);
  };

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

  const categoryRecords = new Map<string, string>();
  async function getCategoryId(brandName: string, series: string) {
    const key = `${brandName}:${series}`;
    if (categoryRecords.has(key)) return categoryRecords.get(key)!;

    const brandId = brandRecords.get(brandName)?.id;
    if (!brandId) throw new Error(`Brand not found: ${brandName}`);

    const categoryName = series || "General";
    const category = await prisma.category.upsert({
      where: { tenantId_name: { tenantId, name: categoryName } },
      create: { tenantId, name: categoryName, brandId },
      update: { brandId },
    });
    categoryRecords.set(key, category.id);
    return category.id;
  }

  const modelIdBySku = await upsertModelsFromPlanogramRows(
    prisma,
    tenantId,
    planogramRows,
    brandRecords,
    getCategoryId,
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

    await prisma.alternateWarehouse.upsert({
      where: { branchId_warehouseId: { branchId: branch.id, warehouseId: mainWarehouse.id } },
      create: { branchId: branch.id, warehouseId: mainWarehouse.id },
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
  const recto = branchRecords.find((b) => b.sapCode === "WRC-002");
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

  const stkCodeId = await resolveStatusCodeId("STK");
  const ditCodeId = await resolveStatusCodeId("DIT");

  const inventorySeed: {
    branchId: string;
    skuCode: string;
    serialNo: string;
    statusCodeId: string;
    ageDays: number;
  }[] = [];

  const makati32 = modelIdBySku.get("32STV104");
  const recto32 = modelIdBySku.get("32STV105");

  if (makati && makati32) {
    inventorySeed.push(
      { branchId: makati.id, skuCode: "32STV104", serialNo: "SN-WMK-001", statusCodeId: stkCodeId, ageDays: 45 },
      { branchId: makati.id, skuCode: "32STV104", serialNo: "SN-WMK-002", statusCodeId: ditCodeId, ageDays: 0 },
      { branchId: makati.id, skuCode: "32STV104", serialNo: "SN-WMK-003", statusCodeId: stkCodeId, ageDays: 5 },
    );
  }

  if (recto && recto32) {
    inventorySeed.push(
      { branchId: recto.id, skuCode: "32STV105", serialNo: "SN-WRC-001", statusCodeId: stkCodeId, ageDays: 12 },
      { branchId: recto.id, skuCode: "32STV105", serialNo: "SN-WRC-002", statusCodeId: ditCodeId, ageDays: 1 },
    );
  }

  if (inventorySeed.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const item of inventorySeed) {
        const modelId = modelIdBySku.get(item.skuCode);
        if (!modelId) continue;

        const stockedAt = new Date(Date.now() - item.ageDays * 24 * 60 * 60 * 1000);

        const sn = await tx.serialNumber.upsert({
          where: { tenantId_serialNo: { tenantId, serialNo: item.serialNo } },
          create: { tenantId, modelId, serialNo: item.serialNo },
          update: { modelId },
        });

        await tx.branchInventory.upsert({
          where: { branchId_serialNumberId: { branchId: item.branchId, serialNumberId: sn.id } },
          create: {
            tenantId,
            branchId: item.branchId,
            serialNumberId: sn.id,
            statusCodeId: item.statusCodeId,
            updatedAt: stockedAt,
          },
          update: { statusCodeId: item.statusCodeId, updatedAt: stockedAt },
        });
      }
    });
  }

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
