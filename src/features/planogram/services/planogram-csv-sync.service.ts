import type { PrismaClient } from "@prisma/client";

import {
  DEALER1_BRANCH_MAP,
  DEFAULT_MIL_DAYS_EXPORT,
  type PlanogramCsvRow,
  parseForecastFromContent,
  parsePlanogramCsvFromContent,
} from "../../../../prisma/seed-planogram-from-csv";

export interface BranchIndexRecord {
  id: string;
  branchIndex: 1 | 2 | 3 | 4;
}

export async function syncPlanogramFromCsvContent(
  prisma: PrismaClient,
  tenantId: string,
  content: string,
  branchRecords: BranchIndexRecord[],
  modelIdBySku: Map<string, string>,
) {
  const planogramRows = parsePlanogramCsvFromContent(content);

  for (const branch of branchRecords) {
    const csvModelIds = new Set<string>();

    const branchPlanogramEntries = planogramRows.flatMap((row) => {
      const target = row.branches.find((b) => b.branchIndex === branch.branchIndex);
      if (!target) return [];

      const modelId = modelIdBySku.get(row.skuCode);
      if (!modelId) return [];

      csvModelIds.add(modelId);
      return [{ modelId, maxQty: target.maxQty }];
    });

    const keepIds = [...csvModelIds];

    if (keepIds.length > 0) {
      await prisma.branchPlanogram.deleteMany({
        where: {
          tenantId,
          branchId: branch.id,
          modelId: { notIn: keepIds },
        },
      });
      await prisma.branchMilSetting.deleteMany({
        where: {
          tenantId,
          branchId: branch.id,
          modelId: { notIn: keepIds },
        },
      });
    } else {
      await prisma.branchPlanogram.deleteMany({ where: { tenantId, branchId: branch.id } });
      await prisma.branchMilSetting.deleteMany({ where: { tenantId, branchId: branch.id } });
    }

    const BATCH_SIZE = 8;
    for (let i = 0; i < branchPlanogramEntries.length; i += BATCH_SIZE) {
      const batch = branchPlanogramEntries.slice(i, i + BATCH_SIZE);
      await prisma.$transaction(
        batch.flatMap(({ modelId, maxQty }) => [
          prisma.branchPlanogram.upsert({
            where: { branchId_modelId: { branchId: branch.id, modelId } },
            create: { tenantId, branchId: branch.id, modelId, maxQty },
            update: { maxQty },
          }),
          prisma.branchMilSetting.upsert({
            where: { branchId_modelId: { branchId: branch.id, modelId } },
            create: {
              tenantId,
              branchId: branch.id,
              modelId,
              daysThreshold: DEFAULT_MIL_DAYS_EXPORT,
            },
            update: { daysThreshold: DEFAULT_MIL_DAYS_EXPORT },
          }),
        ]),
        { timeout: 30_000 },
      );
    }
  }

  return planogramRows;
}

export async function upsertModelsFromPlanogramRows(
  prisma: PrismaClient,
  tenantId: string,
  planogramRows: PlanogramCsvRow[],
  brandRecords: Map<string, { id: string }>,
  getCategoryId: (brandName: string, series: string) => Promise<string>,
) {
  const modelIdBySku = new Map<string, string>();

  for (const row of planogramRows) {
    const brandId = brandRecords.get(row.brand)?.id;
    if (!brandId) continue;

    const categoryId = await getCategoryId(row.brand, row.series);
    const displayName = `${row.brand} ${row.modelName}`;

    const model = await prisma.productModel.upsert({
      where: { tenantId_skuCode: { tenantId, skuCode: row.skuCode } },
      create: {
        tenantId,
        brandId,
        categoryId,
        skuCode: row.skuCode,
        name: displayName,
        status: "active",
        ...(row.srp != null ? { srp: row.srp } : {}),
      },
      update: {
        name: displayName,
        status: "active",
        brandId,
        categoryId,
        ...(row.srp != null ? { srp: row.srp } : {}),
      },
    });

    modelIdBySku.set(row.skuCode, model.id);
  }

  return modelIdBySku;
}

export async function importForecastFromCsvContent(
  prisma: PrismaClient,
  tenantId: string,
  content: string,
  branchByIndex: Map<1 | 2 | 3 | 4, string>,
) {
  const forecast = parseForecastFromContent(content);

  await prisma.planningPeriod.updateMany({
    where: { tenantId, isActive: true },
    data: { isActive: false },
  });

  const period = await prisma.planningPeriod.upsert({
    where: { tenantId_label: { tenantId, label: forecast.periodLabel } },
    create: { tenantId, label: forecast.periodLabel, isActive: true },
    update: { isActive: true },
  });

  for (const target of forecast.branchRevenueTargets) {
    const branchId = branchByIndex.get(target.branchIndex);
    if (!branchId) continue;

    await prisma.branchForecastTarget.upsert({
      where: { periodId_branchId: { periodId: period.id, branchId } },
      create: {
        tenantId,
        periodId: period.id,
        branchId,
        revenueTarget: target.revenueTarget,
      },
      update: { revenueTarget: target.revenueTarget },
    });
  }

  return period;
}

export { DEALER1_BRANCH_MAP, parsePlanogramCsvFromContent, parseForecastFromContent };
