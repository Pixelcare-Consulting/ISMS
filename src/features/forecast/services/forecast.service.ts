import { auditService } from "@/features/audit/services/audit.service";
import { allocationService } from "@/features/forecast/services/allocation.service";
import { forecastRepository } from "@/features/forecast/repositories/forecast.repository";
import {
  importForecastFromCsvContent,
  syncPlanogramFromCsvContent,
  upsertModelsFromPlanogramRows,
  parsePlanogramCsvFromContent,
} from "@/features/planogram/services/planogram-csv-sync.service";
import { prisma } from "@/lib/database/client";
import { DEALER1_BRANCH_MAP } from "../../../../prisma/seed-planogram-from-csv";

export const forecastService = {
  async getPlanningDashboard(tenantId: string) {
    const [period, gapCount, draftOrders] = await Promise.all([
      forecastRepository.getPlanningSummary(tenantId),
      forecastRepository.findActivePeriod(tenantId).then((p) =>
        p ? forecastRepository.countGapsForPeriod(tenantId, p.id) : 0,
      ),
      forecastRepository.countDraftAutoReplenishOrders(tenantId),
    ]);

    return { period, gapCount, draftOrders };
  },

  async importBrsCsv(
    tenantId: string,
    actorUserId: string,
    csvContent: string,
  ) {
    const planogramRows = parsePlanogramCsvFromContent(csvContent);

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

    const branchRecords: { id: string; branchIndex: 1 | 2 | 3 | 4 }[] = [];
    const branchByIndex = new Map<1 | 2 | 3 | 4, string>();

    for (const branchDef of DEALER1_BRANCH_MAP) {
      const branch = await prisma.branch.upsert({
        where: { tenantId_sapCode: { tenantId, sapCode: branchDef.sapCode } },
        create: {
          tenantId,
          sapCode: branchDef.sapCode,
          name: branchDef.name,
          status: "active",
        },
        update: { name: branchDef.name },
      });
      branchRecords.push({ id: branch.id, branchIndex: branchDef.branchIndex });
      branchByIndex.set(branchDef.branchIndex, branch.id);
    }

    await syncPlanogramFromCsvContent(
      prisma,
      tenantId,
      csvContent,
      branchRecords,
      modelIdBySku,
    );

    const period = await importForecastFromCsvContent(
      prisma,
      tenantId,
      csvContent,
      branchByIndex,
    );

    await auditService.log({
      tenantId,
      userId: actorUserId,
      action: "forecast.csv_imported",
      entityType: "PlanningPeriod",
      entityId: period.id,
      metadata: { label: period.label, skuCount: planogramRows.length },
    });

    return { periodId: period.id, label: period.label };
  },

  runAllocation(tenantId: string, periodId: string) {
    return allocationService.runAllocation(tenantId, periodId);
  },

  formatRevenueTarget(value: { toString: () => string } | number) {
    const num = typeof value === "number" ? value : Number(value.toString());
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 0,
    }).format(num);
  },
};
