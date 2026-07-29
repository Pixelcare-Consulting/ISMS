import { GlobalKpiCards, type KpiCardItem } from "@/lib/kpi-cards";

interface DealerKpiRow {
  status: string;
  _count: { branches: number };
}

export function DealersKpisStrip({ rows }: { rows: DealerKpiRow[] }) {
  const total = rows.length;
  const active = rows.filter((r) => r.status === "active").length;
  const inactive = total - active;
  const linkedBranches = rows.reduce((sum, r) => sum + r._count.branches, 0);

  const items: KpiCardItem[] = [
    { key: "total", label: "Total dealers", value: total },
    { key: "active", label: "Active", value: active },
    { key: "inactive", label: "Inactive", value: inactive },
    { key: "branches", label: "Linked branches", value: linkedBranches },
  ];

  return <GlobalKpiCards items={items} />;
}
