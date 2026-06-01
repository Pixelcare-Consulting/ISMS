import type { DashboardKpis } from "@/features/dashboard/services/dashboard-kpi.service";

interface DashboardOpsKpisProps {
  kpis: DashboardKpis;
}

export function DashboardOpsKpis({ kpis }: DashboardOpsKpisProps) {
  const items = [
    { label: "Pending order approvals", value: kpis.pendingOrderApprovals },
    { label: "Delivery in transit", value: kpis.deliveryInTransit },
    { label: "Stock on hand", value: kpis.stockCount },
    { label: "Open ATR", value: kpis.openAtr },
    { label: "Below planogram capacity", value: kpis.belowPlanogramCapacity },
    { label: "MIL threshold breaches", value: kpis.milBreaches },
    { label: "Allocation gaps", value: kpis.allocationGapCount },
    { label: "Draft suggested orders", value: kpis.draftSuggestedOrders },
  ];

  return (
    <div className="responsive-card-grid">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">{item.label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{item.value}</p>
        </div>
      ))}
    </div>
  );
}
