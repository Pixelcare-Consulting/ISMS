import { planogramRepository } from "@/features/planogram/repositories/planogram.repository";
import { forecastRepository } from "@/features/forecast/repositories/forecast.repository";
import { reasonStatusRepository } from "@/features/reason-status/repositories/reason-status.repository";

export const allocationService = {
  async runAllocation(tenantId: string, periodId: string) {
    const period = await forecastRepository.findPeriodById(tenantId, periodId);
    if (!period) throw new Error("Planning period not found");

    const planogramEntries = await planogramRepository.listBelowCapacityAndMilBreaches(
      tenantId,
      null,
    );

    // Batch the per-entry stock counts into one query (was N+1).
    const stk = await reasonStatusRepository.findCodeId(tenantId, "inventory_system", "STK");
    const stockByPair = stk
      ? await planogramRepository.countStockByBranchModelPairs(
          tenantId,
          stk.id,
          planogramEntries.map((e) => ({ branchId: e.branchId, modelId: e.modelId })),
        )
      : new Map<string, number>();

    const computedAt = new Date();
    const allocationRows: {
      branchId: string;
      modelId: string;
      planogramMax: number;
      currentStock: number;
      gapQty: number;
      computedAt: Date;
    }[] = [];

    for (const entry of planogramEntries) {
      const stockCount = stockByPair.get(`${entry.branchId}:${entry.modelId}`) ?? 0;
      const gapQty = Math.max(0, entry.maxQty - stockCount);
      if (gapQty <= 0) continue;

      allocationRows.push({
        branchId: entry.branchId,
        modelId: entry.modelId,
        planogramMax: entry.maxQty,
        currentStock: stockCount,
        gapQty,
        computedAt,
      });
    }

    await forecastRepository.replaceAllocationsForPeriod(tenantId, periodId, allocationRows);

    return {
      computedAt,
      gapCount: allocationRows.length,
      totalGapUnits: allocationRows.reduce((sum, row) => sum + row.gapQty, 0),
    };
  },
};
