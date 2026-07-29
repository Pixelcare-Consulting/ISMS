import type { DashboardKpis } from "@/features/dashboard/services/dashboard-kpi.service";
import { GlobalKpiCards } from "@/lib/kpi-cards";

interface DashboardOpsKpisProps {
  kpis: DashboardKpis;
}

export function DashboardOpsKpis({ kpis }: DashboardOpsKpisProps) {
  const items = [
    { key: "pendingOrderApprovals", label: "Pending order approvals", value: kpis.pendingOrderApprovals },
    { key: "deliveryInTransit", label: "Delivery in transit", value: kpis.deliveryInTransit },
    { key: "stockCount", label: "Stock on hand", value: kpis.stockCount },
    { key: "openAtr", label: "Open ATR", value: kpis.openAtr },
    { key: "belowPlanogramCapacity", label: "Below planogram capacity", value: kpis.belowPlanogramCapacity },
    { key: "milBreaches", label: "MIL threshold breaches", value: kpis.milBreaches },
    { key: "allocationGaps", label: "Allocation gaps", value: kpis.allocationGapCount },
    { key: "draftSuggestedOrders", label: "Draft suggested orders", value: kpis.draftSuggestedOrders },
  ];

  return <GlobalKpiCards items={items} />;
}
