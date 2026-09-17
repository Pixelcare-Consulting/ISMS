"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ReplenishmentPlanStatusBadge } from "@/features/demand-planning";
import {
  formatDemandPeso,
  formatDemandQty,
  formatDemandShare,
} from "@/features/demand-planning/lib/format-demand-plan";
import type { ReplenishmentMatrixView } from "@/features/demand-planning/types/workbench.types";
import { GlobalDataTable } from "@/lib/data-table";
import { KpiCard } from "@/lib/kpi-cards";

export function ReplenishmentMatrix({
  view,
  query,
  canManage,
}: {
  view: ReplenishmentMatrixView;
  query: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(query);

  function hrefFor(next: { page?: number; period?: string; q?: string }) {
    const params = new URLSearchParams();
    const period = next.period ?? view.selectedPeriodId ?? "";
    const q = next.q ?? query;
    const page = next.page ?? view.page;
    if (period) params.set("period", period);
    if (q) params.set("q", q);
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    return `/planning/replenishment${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="space-y-4">
      <div className="responsive-card-grid">
        <KpiCard label="Branches" value={String(view.total)} />
        <KpiCard label="Generated" value={String(view.generatedCount)} />
        <KpiCard label="Awaiting history" value={String(view.awaitingCount)} />
        <KpiCard
          label={`${view.periodLabel ?? "Period"} target`}
          value={formatDemandPeso(view.networkTargetPeso)}
          hint={`${formatDemandQty(view.networkTargetQty)} units`}
        />
      </div>

      {view.releasedDocumentNumber ? (
        <p className="text-sm text-muted-foreground">
          Released plan {view.releasedDocumentNumber} is the source for supplementary send. Live
          Drop 1 still uses current stock and forecast.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          No released Demand Planning run for this period yet. You can review the matrix, but Send
          waits until a plan is released.
        </p>
      )}

      <GlobalDataTable
        empty={view.rows.length === 0}
        emptyMessage="No branches match this period filter."
        search={{
          value: search,
          placeholder: "Search dealer or branch…",
          onChange: (value) => {
            setSearch(value);
            router.push(hrefFor({ page: 1, q: value }));
          },
        }}
        toolbarLeading={
          <SearchableSelect
            className="w-56"
            options={view.periods.map((period) => ({
              id: period.id,
              label: period.isActive ? `${period.label} (active)` : period.label,
            }))}
            value={view.selectedPeriodId ?? ""}
            onChange={(periodId) => router.push(hrefFor({ page: 1, period: periodId }))}
            placeholder="Planning period"
          />
        }
        pagination={{
          total: view.total,
          page: view.page,
          totalPages: view.totalPages,
          itemLabel: "branch",
          buildHref: (nextPage) => hrefFor({ page: nextPage }),
        }}
      >
        <TableHeader>
          <TableRow>
            <TableHead>Dealer</TableHead>
            <TableHead>Branch</TableHead>
            <TableHead className="text-right">Planogram SKUs</TableHead>
            <TableHead className="text-right">{view.periodLabel ?? "Period"} target ₱</TableHead>
            <TableHead className="text-right">Target units</TableHead>
            <TableHead className="text-right">Share of network</TableHead>
            <TableHead>Plan status</TableHead>
            <TableHead className="w-28" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {view.rows.map((row) => (
            <TableRow key={row.branchId}>
              <TableCell>{row.dealerName ?? "—"}</TableCell>
              <TableCell>
                <p className="font-medium">{row.name}</p>
                <p className="font-mono text-xs text-muted-foreground">{row.sapCode}</p>
              </TableCell>
              <TableCell className="text-right tabular-nums">{row.planogramSkuCount}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatDemandPeso(row.targetPeso)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatDemandQty(row.targetQty)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatDemandShare(row.shareOfNetwork)}
              </TableCell>
              <TableCell>
                <ReplenishmentPlanStatusBadge status={row.planStatus} />
              </TableCell>
              <TableCell className="text-right">
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={`/planning/replenishment/${row.branchId}${
                      view.selectedPeriodId ? `?period=${view.selectedPeriodId}` : ""
                    }`}
                  >
                    {canManage ? "Open" : "View"}
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </GlobalDataTable>
    </div>
  );
}
