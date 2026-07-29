import type { StockCountKpis } from "@/features/stock-audit/services/stock-audit.service";

interface StockCountKpisStripProps {
  kpis: StockCountKpis;
}

export function StockCountKpisStrip({ kpis }: StockCountKpisStripProps) {
  const items = [
    { key: "total", label: "Total sessions", value: kpis.totalSessions },
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
