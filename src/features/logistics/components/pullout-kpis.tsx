import type { LogisticsKpis } from "@/features/logistics/actions/logistics.actions";
import { GlobalKpiCards, buildStatusKpiItems } from "@/lib/kpi-cards";

export function PulloutKpisStrip({ kpis }: { kpis: LogisticsKpis }) {
  return (
    <GlobalKpiCards
      items={buildStatusKpiItems({
        totalLabel: "Total pull-outs",
        totalValue: kpis.total,
        statuses: kpis.statuses,
      })}
    />
  );
}
