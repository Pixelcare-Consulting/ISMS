import type { InventoryKpis } from "@/features/inventory/services/inventory.service";
import { GlobalKpiCards, buildStatusKpiItems } from "@/lib/kpi-cards";

interface InventoryKpisStripProps {
  kpis: InventoryKpis;
}

export function InventoryKpisStrip({ kpis }: InventoryKpisStripProps) {
  return (
    <GlobalKpiCards
      items={buildStatusKpiItems({
        totalLabel: "Total units",
        totalValue: kpis.totalUnits,
        statuses: kpis.statuses,
      })}
    />
  );
}
