import Link from "next/link";

import type { DashboardSalesRankingRow } from "@/features/dashboard/services/dashboard-sales.service";
import { formatPeso } from "@/utils/format-currency";

interface DashboardSalesRankingsProps {
  topBranches: DashboardSalesRankingRow[];
  topModels: DashboardSalesRankingRow[];
}

function RankingCard({
  title,
  description,
  rows,
  formatValue,
  emptyLabel,
}: {
  title: string;
  description: string;
  rows: DashboardSalesRankingRow[];
  formatValue: (value: number) => string;
  emptyLabel: string;
}) {
  return (
    <div className="flex min-h-64 flex-col rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Link
          href="/sales"
          className="shrink-0 text-sm font-medium text-primary hover:underline"
        >
          View sales
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-8 text-sm text-muted-foreground">
          {emptyLabel}
        </div>
      ) : (
        <ol className="mt-4 flex flex-1 flex-col divide-y rounded-lg border">
          {rows.map((row, index) => (
            <li
              key={row.id}
              className="flex items-center gap-3 px-3 py-2.5 text-sm"
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold tabular-nums text-muted-foreground">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">
                {row.name}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatValue(row.value)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function DashboardSalesRankings({
  topBranches,
  topModels,
}: DashboardSalesRankingsProps) {
  return (
    <div className="grid items-stretch gap-3 lg:grid-cols-2">
      <RankingCard
        title="Top branches"
        description="Highest sale amount this month"
        rows={topBranches}
        formatValue={(value) => formatPeso(value)}
        emptyLabel="No branch sales this month yet."
      />
      <RankingCard
        title="Top models"
        description="Most units sold this month"
        rows={topModels}
        formatValue={(value) => `${value.toLocaleString()} units`}
        emptyLabel="No model sales this month yet."
      />
    </div>
  );
}
