import { GlobalKpiCards, type KpiCardItem } from "@/lib/kpi-cards";

interface BranchKpiRow {
  status: string;
  dealerId?: string | null;
}

export function BranchesKpisStrip({ rows }: { rows: BranchKpiRow[] }) {
  const total = rows.length;
  const active = rows.filter((r) => r.status === "active").length;
  const inactive = total - active;
  const unassigned = rows.filter((r) => !r.dealerId).length;

  const items: KpiCardItem[] = [
    { key: "total", label: "Total branches", value: total },
    { key: "active", label: "Active", value: active },
    { key: "inactive", label: "Inactive", value: inactive },
    { key: "unassigned", label: "Unassigned to dealer", value: unassigned },
  ];

  return <GlobalKpiCards items={items} />;
}
