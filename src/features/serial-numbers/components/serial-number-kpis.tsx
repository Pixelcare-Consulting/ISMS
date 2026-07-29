import type { SerialNumberKpis } from "@/features/serial-numbers/services/serial-number.service";

interface SerialNumberKpisStripProps {
  kpis: SerialNumberKpis;
}

export function SerialNumberKpisStrip({ kpis }: SerialNumberKpisStripProps) {
  const items = [
    { key: "total", label: "Total serials", value: kpis.totalSerials },
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
