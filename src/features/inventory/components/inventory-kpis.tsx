import type { InventoryKpis } from "@/features/inventory/services/inventory.service";
import { GlobalKpiCards, buildStatusKpiItems } from "@/lib/kpi-cards";

interface InventoryKpisStripProps {
  kpis: InventoryKpis;
}

export function InventoryKpisStrip({ kpis }: InventoryKpisStripProps) {
  return (
    <GlobalKpiCards
      gridClassName="responsive-card-grid-compact"
      cardClassName="bg-background px-3 py-2.5 shadow-none [&_.tabular-nums]:mt-0.5 [&_.tabular-nums]:text-xl"
      items={buildStatusKpiItems({
        totalLabel: "Total units",
        totalValue: kpis.totalUnits,
        statuses: kpis.statuses,
        statusBadges: true,
      })}
    />
  );
}
