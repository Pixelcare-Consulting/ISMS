import { planogramRepository } from "@/features/planogram/repositories/planogram.repository";
import { forecastRepository } from "@/features/forecast/repositories/forecast.repository";

export const allocationService = {
  async runAllocation(tenantId: string, periodId: string) {
    const period = await forecastRepository.findPeriodById(tenantId, periodId);
    if (!period) throw new Error("Planning period not found");

    const planogramEntries = await planogramRepository.listBelowCapacityAndMilBreaches(
      tenantId,
      null,
    );

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
      const stockCount = await planogramRepository.countStockForModel(
        tenantId,
        entry.branchId,
        entry.modelId,
      );
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

    await forecastRepository.deleteAllocationsForPeriod(tenantId, periodId);
    await forecastRepository.createAllocations(tenantId, periodId, allocationRows);

    return {
      computedAt,
      gapCount: allocationRows.length,
      totalGapUnits: allocationRows.reduce((sum, row) => sum + row.gapQty, 0),
    };
  },
};
