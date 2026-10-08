import type { SerialNumberKpis } from "@/features/serial-numbers/services/serial-number.service";
import { GlobalKpiCards, buildStatusKpiItems } from "@/lib/kpi-cards";

interface SerialNumberKpisStripProps {
  kpis: SerialNumberKpis;
}

export function SerialNumberKpisStrip({ kpis }: SerialNumberKpisStripProps) {
  return (
    <GlobalKpiCards
      items={buildStatusKpiItems({
        totalLabel: "Total models",
        totalValue: kpis.totalModels,
        statuses: kpis.statuses,
      })}
    />
  );
}
