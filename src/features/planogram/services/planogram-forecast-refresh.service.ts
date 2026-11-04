import { auditService } from "@/features/audit/services/audit.service";
import { demandPlanningFactsRepository } from "@/features/demand-planning/repositories/demand-planning-facts.repository";
import {
  EMPTY_PLANOGRAM_REFRESH_SUMMARY,
  latestDisplayUnitsByPair,
  planForecastRefresh,
  planogramPairKey,
  type PlanogramRefreshSummary,
} from "@/features/planogram/lib/target-forecast-qty";
import { prisma } from "@/lib/database/client";
import { mapWithConcurrency } from "@/lib/shared/concurrency";

const WRITE_CONCURRENCY = 8;

/** Display units live on planning run lines, not on inventory. */
async function loadDisplayUnits(tenantId: string, branchIds: string[]) {
  const lines = await prisma.demandPlanningLine.findMany({
    where: {
      tenantId,
      runBranch: { branchId: { in: branchIds } },
      run: { status: { not: "superseded" } },
    },
    orderBy: { run: { createdAt: "desc" } },
    select: {
      modelId: true,
      displayUnits: true,
      runBranch: { select: { branchId: true } },
    },
  });
  return latestDisplayUnitsByPair(
    lines.map((line) => ({
      branchId: line.runBranch.branchId,
      modelId: line.modelId,
      displayUnits: line.displayUnits,
    })),
  );
}

async function loadFrequencies(tenantId: string, branchIds: string[]) {
  const branches = await demandPlanningFactsRepository.listActiveBranchesByIds(
    tenantId,
    branchIds,
  );
  return new Map(
    branches.map((branch) => [
      branch.id,
      branch.deliveryScheduleConfig?.frequencyCode.frequency ?? null,
    ]),
  );
}

export const planogramForecastRefreshService = {
  /**
   * Recalculates Shelf max for every planogram row of these branches. Reads saved
   * forecast targets, not the upload, so unchanged rows and partial files are covered.
   */
  async refreshForBranches(input: {
    tenantId: string;
    actorUserId: string;
    periodId: string;
    periodLabel: string;
    branchIds: string[];
  }): Promise<PlanogramRefreshSummary> {
    if (input.branchIds.length === 0) return EMPTY_PLANOGRAM_REFRESH_SUMMARY;

    const { tenantId, branchIds } = input;
    const [rows, forecasts, displayUnitsByPair, frequencyByBranch] = await Promise.all([
      prisma.branchPlanogram.findMany({
        where: { tenantId, branchId: { in: branchIds } },
        select: {
          id: true,
          branchId: true,
          modelId: true,
          maxQty: true,
          maxQtyEditedAt: true,
          maxQtyCalc: true,
          model: { select: { skuCode: true } },
          branch: { select: { name: true } },
        },
      }),
      prisma.skuForecastTarget.findMany({
        where: { tenantId, periodId: input.periodId, branchId: { in: branchIds } },
        select: { branchId: true, modelId: true, qty: true },
      }),
      loadDisplayUnits(tenantId, branchIds),
      loadFrequencies(tenantId, branchIds),
    ]);

    const { updates, summary } = planForecastRefresh({
      rows: rows.map((row) => ({
        id: row.id,
        branchId: row.branchId,
        branchName: row.branch.name,
        modelId: row.modelId,
        skuCode: row.model.skuCode,
        maxQty: row.maxQty,
        maxQtyEditedAt: row.maxQtyEditedAt,
        maxQtyCalc: row.maxQtyCalc,
      })),
      forecastByPair: new Map(
        forecasts.map((target) => [
          planogramPairKey(target.branchId, target.modelId),
          target.qty,
        ]),
      ),
      displayUnitsByPair,
      frequencyByBranch,
      periodLabel: input.periodLabel,
      computedAt: new Date().toISOString(),
    });

    await mapWithConcurrency(updates, WRITE_CONCURRENCY, (update) =>
      prisma.branchPlanogram.update({
        where: { id: update.id, tenantId },
        data: {
          maxQty: update.maxQty,
          maxQtyCalc: update.maxQtyCalc,
          maxQtyEditedAt: null,
        },
      }),
    );

    const audits = updates
      .filter((update) => update.maxQty !== update.previousMaxQty)
      .map((update) => ({
        tenantId,
        userId: input.actorUserId,
        action: "planogram.max_qty_updated",
        entityType: "BranchPlanogram",
        entityId: update.id,
        metadata: {
          branchId: update.branchId,
          modelId: update.modelId,
          maxQty: update.maxQty,
          previousMaxQty: update.previousMaxQty,
          forecastQty: update.maxQtyCalc.forecastQty,
          displayUnits: update.maxQtyCalc.displayUnits,
          dropsPerMonth: update.maxQtyCalc.dropsPerMonth,
          periodLabel: update.maxQtyCalc.periodLabel,
          overriddenManualQty: update.maxQtyCalc.overriddenManualQty,
          source: "forecast-import",
        },
      }));
    if (audits.length > 0) await auditService.logMany(audits);

    return summary;
  },
};
