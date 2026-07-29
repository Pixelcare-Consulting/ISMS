import type { SerialNumberKpis } from "@/features/serial-numbers/services/serial-number.service";
import { GlobalKpiCards, buildStatusKpiItems } from "@/lib/kpi-cards";

interface SerialNumberKpisStripProps {
  kpis: SerialNumberKpis;
}

export function SerialNumberKpisStrip({ kpis }: SerialNumberKpisStripProps) {
  return (
    <GlobalKpiCards
      items={buildStatusKpiItems({
        totalLabel: "Total serials",
        totalValue: kpis.totalSerials,
        statuses: kpis.statuses,
      })}
    />
  );
}
