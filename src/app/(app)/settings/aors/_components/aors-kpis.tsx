import { GlobalKpiCards, type KpiCardItem } from "@/lib/kpi-cards";

interface AorKpiRow {
  user: { id: string };
  branch: { id: string } | null;
  warehouse: { id: string } | null;
  dealer: { id: string } | null;
}

export function AorsKpisStrip({ rows }: { rows: AorKpiRow[] }) {
  const total = rows.length;
  const usersWithAors = new Set(rows.map((r) => r.user.id)).size;
  const branchAssignments = rows.filter((r) => r.branch).length;
  const warehouseAssignments = rows.filter((r) => r.warehouse).length;
  const dealerAssignments = rows.filter((r) => r.dealer).length;

  const items: KpiCardItem[] = [
    { key: "users", label: "Users with AORs", value: usersWithAors },
    { key: "total", label: "Total assignments", value: total },
    { key: "branches", label: "Branch assignments", value: branchAssignments },
    { key: "warehouses", label: "Warehouse assignments", value: warehouseAssignments },
    { key: "dealers", label: "Dealer assignments", value: dealerAssignments },
  ];

  return <GlobalKpiCards items={items} />;
}
