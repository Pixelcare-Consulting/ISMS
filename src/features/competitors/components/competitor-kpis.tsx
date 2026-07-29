import type { CompetitorKpis } from "@/features/competitors/services/competitor.service";
import { KpiCard } from "@/lib/kpi-cards";
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
        <KpiCard key={item.label} label={item.label} value={item.value} />
      ))}
    </div>
  );
}
