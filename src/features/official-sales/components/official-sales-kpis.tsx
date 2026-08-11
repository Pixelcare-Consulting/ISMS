import type { OfficialSalesKpis } from "@/features/official-sales/services/official-sales-kpi.service";
import { GlobalKpiCards, buildStatusKpiItems } from "@/lib/kpi-cards";

interface OfficialSalesKpisStripProps {
  kpis: OfficialSalesKpis;
}

export function OfficialSalesKpisStrip({ kpis }: OfficialSalesKpisStripProps) {
  return (
    <GlobalKpiCards
      items={buildStatusKpiItems({
        totalLabel: "Total rows",
        totalValue: kpis.totalRows,
        statuses: kpis.statuses,
      })}
    />
  );
}
