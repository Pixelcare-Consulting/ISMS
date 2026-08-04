import type { DashboardKpiKey } from "@/features/dashboard/constants/dashboard-permissions";
import type { DashboardKpis } from "@/features/dashboard/services/dashboard-kpi.service";

/** Map a dashboard KPI key to its numeric value on the KPI payload. */
export function dashboardKpiValue(
  key: DashboardKpiKey,
  kpis: DashboardKpis,
): number {
  switch (key) {
    case "pendingOrderApprovals":
      return kpis.pendingOrderApprovals;
    case "deliveryInTransit":
      return kpis.deliveryInTransit;
    case "stockCount":
      return kpis.stockCount;
    case "openAtr":
      return kpis.openAtr;
    case "belowPlanogramCapacity":
      return kpis.belowPlanogramCapacity;
    case "milBreaches":
      return kpis.milBreaches;
    case "allocationGaps":
      return kpis.allocationGapCount;
    case "draftSuggestedOrders":
      return kpis.draftSuggestedOrders;
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}

/**
 * Keys that belong in the secondary “Planning & alerts” panel when not
 * already shown in the top activity strip. Stock on hand is covered by
 * Inventory summary, so it is omitted here.
 */
export const OPS_ALERT_KPI_KEYS: readonly DashboardKpiKey[] = [
  "pendingOrderApprovals",
  "deliveryInTransit",
  "openAtr",
  "belowPlanogramCapacity",
  "milBreaches",
  "allocationGaps",
  "draftSuggestedOrders",
] as const;
