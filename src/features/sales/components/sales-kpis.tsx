import type { SalesKpis } from "@/features/sales/services/sales-kpi.service";
import { GlobalKpiCards, buildStatusKpiItems } from "@/lib/kpi-cards";

interface SalesKpisStripProps {
  kpis: SalesKpis;
}

export function SalesKpisStrip({ kpis }: SalesKpisStripProps) {
  return (
    <GlobalKpiCards
      items={buildStatusKpiItems({
        totalLabel: "Total lines",
        totalValue: kpis.totalLines,
        statuses: kpis.statuses,
      })}
    />
  );
}
