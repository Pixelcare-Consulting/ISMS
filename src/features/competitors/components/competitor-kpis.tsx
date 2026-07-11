import type { CompetitorKpis } from "@/features/competitors/services/competitor.service";
import { formatPeso } from "@/utils/format-currency";

interface CompetitorKpisStripProps {
  kpis: CompetitorKpis;
}

export function CompetitorKpisStrip({ kpis }: CompetitorKpisStripProps) {
  const items = [
    { label: "Entries this month", value: String(kpis.entriesThisMonth) },
    { label: "Distinct competitors", value: String(kpis.distinctCompetitors) },
    {
      label: "Average price",
      value: kpis.avgPrice != null ? formatPeso(kpis.avgPrice) : "—",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">{item.label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{item.value}</p>
        </div>
      ))}
    </div>
  );
}
