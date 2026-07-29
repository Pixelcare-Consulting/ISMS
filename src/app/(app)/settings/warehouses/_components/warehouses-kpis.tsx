import { GlobalKpiCards, type KpiCardItem } from "@/lib/kpi-cards";

interface WarehouseKpiRow {
  isMain: boolean;
  locations: unknown[];
  _count: { aors: number };
}

export function WarehousesKpisStrip({ rows }: { rows: WarehouseKpiRow[] }) {
  const total = rows.length;
  const main = rows.filter((r) => r.isMain).length;
  const totalLocations = rows.reduce((sum, r) => sum + r.locations.length, 0);
  const aorLinked = rows.filter((r) => r._count.aors > 0).length;

  const items: KpiCardItem[] = [
    { key: "total", label: "Total warehouses", value: total },
    { key: "main", label: "Main warehouses", value: main },
    { key: "locations", label: "Total locations", value: totalLocations },
    { key: "aor", label: "AOR-linked warehouses", value: aorLinked },
  ];

  return <GlobalKpiCards items={items} />;
}
