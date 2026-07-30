import type { LogisticsKpis } from "@/features/logistics/actions/logistics.actions";
import { GlobalKpiCards, buildStatusKpiItems } from "@/lib/kpi-cards";

export function DeliveryKpisStrip({ kpis }: { kpis: LogisticsKpis }) {
  return (
    <GlobalKpiCards
      items={buildStatusKpiItems({
        totalLabel: "Total deliveries",
        totalValue: kpis.total,
        statuses: kpis.statuses,
      })}
    />
  );
}
