import type { DashboardSalesAnalytics } from "@/features/dashboard/services/dashboard-sales.service";
import { DashboardSalesKpisStrip } from "@/app/(app)/dashboard/_components/dashboard-sales-kpis";
import { DashboardSalesStatusDonut } from "@/app/(app)/dashboard/_components/dashboard-sales-status-donut";
import { DashboardSalesPipelineBars } from "@/app/(app)/dashboard/_components/dashboard-sales-pipeline-bars";
import { DashboardSalesRankings } from "@/app/(app)/dashboard/_components/dashboard-sales-rankings";

interface DashboardSalesSectionProps {
  analytics: DashboardSalesAnalytics;
}

export function DashboardSalesSection({
  analytics,
}: DashboardSalesSectionProps) {
  return (
    <section className="space-y-3" aria-labelledby="dashboard-sales-heading">
      <div>
        <h2 id="dashboard-sales-heading" className="text-lg font-semibold">
          Sales overview
        </h2>
        <p className="text-sm text-muted-foreground">
          Branch sales, ATR, and returns in your area this month
        </p>
      </div>

      <DashboardSalesKpisStrip kpis={analytics.kpis} />

      <div className="grid items-stretch gap-3 lg:grid-cols-2">
        <DashboardSalesStatusDonut data={analytics.saleStatusMix} />
        <div className="min-w-0 h-full">
          <DashboardSalesPipelineBars data={analytics.atrReturnPipeline} />
        </div>
      </div>

      <DashboardSalesRankings
        topBranches={analytics.topBranches}
        topModels={analytics.topModels}
      />
    </section>
  );
}
