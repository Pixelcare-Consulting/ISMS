import type { SerialActivityKpis } from "@/features/serial-activity/services/serial-activity-kpi.service";
import { GlobalKpiCards, buildStatusKpiItems } from "@/lib/kpi-cards";

interface SerialActivityKpisStripProps {
  kpis: SerialActivityKpis;
}

export function SerialActivityKpisStrip({ kpis }: SerialActivityKpisStripProps) {
  return (
    <GlobalKpiCards
      items={buildStatusKpiItems({
        totalLabel: "Total events",
        totalValue: kpis.totalEvents,
        statuses: kpis.statuses,
      })}
    />
  );
}
