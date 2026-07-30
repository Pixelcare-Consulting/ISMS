import type { StockCountKpis } from "@/features/stock-audit/services/stock-audit.service";
import { GlobalKpiCards, buildStatusKpiItems } from "@/lib/kpi-cards";

interface StockCountKpisStripProps {
  kpis: StockCountKpis;
}

export function StockCountKpisStrip({ kpis }: StockCountKpisStripProps) {
  return (
    <GlobalKpiCards
      items={buildStatusKpiItems({
        totalLabel: "Total sessions",
        totalValue: kpis.totalSessions,
        statuses: kpis.statuses,
      })}
    />
  );
}
