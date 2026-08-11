import type { ReturnsKpis } from "@/features/returns/services/returns-kpi.service";
import { GlobalKpiCards, buildStatusKpiItems } from "@/lib/kpi-cards";

interface ReturnsKpisStripProps {
  kpis: ReturnsKpis;
}

export function ReturnsKpisStrip({ kpis }: ReturnsKpisStripProps) {
  return (
    <GlobalKpiCards
      items={buildStatusKpiItems({
        totalLabel: "Total returns",
        totalValue: kpis.totalReturns,
        statuses: kpis.statuses,
      })}
    />
  );
}
