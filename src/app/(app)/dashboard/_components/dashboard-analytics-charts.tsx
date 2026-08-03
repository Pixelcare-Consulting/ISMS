import type { DashboardKpiKey } from "@/features/dashboard/constants/dashboard-permissions";
import type {
  DashboardAnalytics,
  DashboardKpis,
} from "@/features/dashboard/services/dashboard-kpi.service";
import { DashboardOpsAlerts } from "@/app/(app)/dashboard/_components/dashboard-ops-alerts";
import { DashboardPeriodSnapshotCard } from "@/app/(app)/dashboard/_components/dashboard-period-snapshot";
import { OrderPipelineBars } from "@/app/(app)/dashboard/_components/order-pipeline-bars";
import { StockStatusDonut } from "@/app/(app)/dashboard/_components/stock-status-donut";

interface DashboardAnalyticsChartsProps {
  analytics: DashboardAnalytics;
  kpis: DashboardKpis | null;
  opsAlertKeys?: DashboardKpiKey[];
  showStockChart?: boolean;
  showOrderChart?: boolean;
  showOpsAlerts?: boolean;
  showPeriodSnapshot?: boolean;
  showOrdersThisMonth?: boolean;
  showSalesThisMonth?: boolean;
  showDeliveryInTransit?: boolean;
}

export function DashboardAnalyticsCharts({
  analytics,
  kpis,
  opsAlertKeys = [],
  showStockChart = true,
  showOrderChart = true,
  showOpsAlerts = false,
  showPeriodSnapshot = false,
  showOrdersThisMonth = false,
  showSalesThisMonth = false,
  showDeliveryInTransit = false,
}: DashboardAnalyticsChartsProps) {
  const alertsVisible =
    showOpsAlerts && Boolean(kpis) && opsAlertKeys.length > 0;
  const periodVisible = showPeriodSnapshot;
  const topRow = showStockChart || alertsVisible;
  const bottomPair = periodVisible || showOrderChart;

  if (!topRow && !bottomPair) return null;

  const periodCard = periodVisible ? (
    <DashboardPeriodSnapshotCard
      snapshot={analytics.periodSnapshot}
      showOrders={showOrdersThisMonth}
      showSales={showSalesThisMonth}
      showDeliveryInTransit={showDeliveryInTransit}
    />
  ) : null;

  const pipelineCard = showOrderChart ? (
    <OrderPipelineBars data={analytics.ordersByStatus} />
  ) : null;

  return (
    <section className="space-y-3">
      {topRow ? (
        <div className="grid items-stretch gap-3 lg:grid-cols-2">
          {showStockChart ? (
            <StockStatusDonut data={analytics.inventoryByStatus} />
          ) : null}
          {alertsVisible && kpis ? (
            <DashboardOpsAlerts kpis={kpis} keys={opsAlertKeys} />
          ) : null}
        </div>
      ) : null}

      {bottomPair ? (
        <div className="grid items-stretch gap-3 lg:grid-cols-2">
          {periodCard ? <div className="min-w-0 h-full">{periodCard}</div> : null}
          {pipelineCard ? (
            <div className="min-w-0 h-full">{pipelineCard}</div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
