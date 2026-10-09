import type { SerialNumberKpis } from "@/features/serial-numbers/services/serial-number.service";
import { GlobalKpiCards, buildStatusKpiItems } from "@/lib/kpi-cards";

interface SerialNumberKpisStripProps {
  kpis: SerialNumberKpis;
  /** Flat list uses serial counts; By model uses model counts. */
  mode?: "serials" | "models";
}

export function SerialNumberKpisStrip({
  kpis,
  mode = "serials",
}: SerialNumberKpisStripProps) {
  const totalLabel = mode === "models" ? "Total models" : "Total serials";
  const totalValue = mode === "models" ? kpis.totalModels : kpis.totalSerials;

  return (
    <GlobalKpiCards
      items={buildStatusKpiItems({
        totalLabel,
        totalValue,
        statuses: kpis.statuses,
      })}
    />
  );
}
