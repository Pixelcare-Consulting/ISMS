import { allocationService } from "@/features/forecast/services/allocation.service";
import { forecastRepository } from "@/features/forecast/repositories/forecast.repository";

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
