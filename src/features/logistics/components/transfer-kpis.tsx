import type { LogisticsKpis } from "@/features/logistics/actions/logistics.actions";
import { GlobalKpiCards, buildStatusKpiItems } from "@/lib/kpi-cards";

export function TransferKpisStrip({ kpis }: { kpis: LogisticsKpis }) {
  return (
    <GlobalKpiCards
      items={buildStatusKpiItems({
        totalLabel: "Total transfers",
        totalValue: kpis.total,
        statuses: kpis.statuses,
      })}
    />
  );
}
