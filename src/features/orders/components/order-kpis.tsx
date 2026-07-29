import type { OrderKpis } from "@/features/orders/services/order.service";
import { GlobalKpiCards, buildStatusKpiItems } from "@/lib/kpi-cards";

interface OrderKpisStripProps {
  kpis: OrderKpis;
}

export function OrderKpisStrip({ kpis }: OrderKpisStripProps) {
  return (
    <GlobalKpiCards
      items={buildStatusKpiItems({
        totalLabel: "Total orders",
        totalValue: kpis.totalOrders,
        statuses: kpis.statuses,
      })}
    />
  );
}
