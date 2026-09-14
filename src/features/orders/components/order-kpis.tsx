import type { OrderKpis } from "@/features/orders/services/order.service";
import { GlobalKpiCards, buildStatusKpiItems } from "@/lib/kpi-cards";

interface OrderKpisSummaryProps {
  kpis: OrderKpis;
}

export function OrderKpisSummary({ kpis }: OrderKpisSummaryProps) {
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
