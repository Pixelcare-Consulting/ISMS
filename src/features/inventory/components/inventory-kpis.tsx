import type { InventoryKpis } from "@/features/inventory/services/inventory.service";

interface InventoryKpisStripProps {
  kpis: InventoryKpis;
}

export function InventoryKpisStrip({ kpis }: InventoryKpisStripProps) {
  const items = [
    { key: "total", label: "Total units", value: kpis.totalUnits },
    ...kpis.statuses.map((status) => ({
      key: status.code,
      label: `${status.name} (${status.code})`,
      value: status.count,
    })),
  ];

  return (
    <div className="responsive-card-grid">
      {items.map((item) => (
        <div key={item.key} className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">{item.label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{item.value}</p>
        </div>
      ))}
    </div>
  );
}
