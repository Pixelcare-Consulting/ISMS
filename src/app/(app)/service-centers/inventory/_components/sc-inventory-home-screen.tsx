"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";

import { V2MetricCard } from "@/app/(app)/inventory/v2/_components/v2-metric-card";
import { V2TealLink } from "@/app/(app)/inventory/v2/_components/v2-teal-link";
import { scInventoryHref } from "@/app/(app)/service-centers/inventory/links";
import { useClientTablePagination } from "@/components/data-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import type { ScInventoryOverviewDto } from "@/features/service-center-ops/actions/sc-inventory.actions";
import type { ScInventoryCenterRow } from "@/features/service-center-ops/lib/sc-inventory-overview";
import { DataTable, type DataTableColumn, type DataTableFeatures } from "@/lib/data-table";

interface ScInventoryHomeScreenProps {
  overview: ScInventoryOverviewDto["overview"];
  statuses: ScInventoryOverviewDto["statuses"];
  seriesOptions: { id: string; name: string }[];
  /** Selected series id. Omitted means All series. */
  seriesId?: string;
  seriesSummary?: ReactNode;
}

const centerColumn = createColumnHelper<DataTableFeatures, ScInventoryCenterRow>();

function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

export function ScInventoryHomeScreen({
  overview,
  statuses,
  seriesOptions,
  seriesId,
  seriesSummary,
}: ScInventoryHomeScreenProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const { cards } = overview;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return overview.centers;
    return overview.centers.filter(
      (row) =>
        row.center.name.toLowerCase().includes(needle) ||
        row.center.sapCode.toLowerCase().includes(needle),
    );
  }, [overview.centers, query]);

  const { page, setPage, pageSize, setPageSize, total, totalPages, pageItems, indexOffset } =
    useClientTablePagination(filtered, { resetKey: `${query}:${seriesId ?? ""}` });

  const filteredUnits = filtered.reduce((sum, row) => sum + row.total, 0);

  const columns = useMemo((): DataTableColumn<ScInventoryCenterRow>[] => {
    const cols: DataTableColumn<ScInventoryCenterRow>[] = [
      centerColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => indexOffset + row.index + 1,
        meta: { mobile: "detail", className: "w-12 pl-4 text-center tabular-nums text-muted-foreground" },
      }),
      centerColumn.accessor((row) => row.center.name, {
        id: "center",
        header: "Service center",
        enableSorting: false,
        cell: ({ row }) => {
          const defective = row.original.statusCounts.DEF ?? 0;
          const inTransit = row.original.statusCounts.DIT ?? 0;
          return (
            <div className="min-w-0">
              <span className="block font-medium">{row.original.center.name}</span>
              <span className="text-xs text-muted-foreground">{row.original.center.sapCode}</span>
              {inTransit > 0 ? (
                <span className="mt-0.5 block text-xs text-amber-700 dark:text-amber-400">
                  · {inTransit.toLocaleString()} waiting to be accepted
                </span>
              ) : null}
              {defective > 0 ? (
                <span className="mt-0.5 block text-xs text-rose-700 dark:text-rose-400">
                  · {defective.toLocaleString()} defective
                </span>
              ) : null}
            </div>
          );
        },
        meta: { wrap: true, mobile: "primary", className: "min-w-[10rem]" },
      }),
      centerColumn.accessor((row) => row.total, {
        id: "total",
        header: "Total units",
        enableSorting: false,
        cell: ({ row }) => row.original.total.toLocaleString(),
        meta: { align: "end", mobile: "primary", className: "tabular-nums" },
      }),
    ];

    for (const status of statuses) {
      cols.push(
        centerColumn.display({
          id: `status-${status.code}`,
          header: () => (
            <StatusCodeBadge
              code={status.code}
              name={status.name}
              color={status.color ?? undefined}
              codeOnly
              className="normal-case tracking-normal"
            />
          ),
          enableSorting: false,
          cell: ({ row }) => (row.original.statusCounts[status.code] ?? 0).toLocaleString(),
          meta: { align: "end", mobile: "detail", className: "tabular-nums text-xs" },
        }),
      );
    }

    cols.push(
      centerColumn.display({
        id: "open",
        header: () => <span className="sr-only">Open</span>,
        enableSorting: false,
        cell: ({ row }) => (
          <V2TealLink href={scInventoryHref({ centerId: row.original.center.id, series: seriesId })}>
            Open service center →
          </V2TealLink>
        ),
        meta: { align: "end", mobile: "primary" },
      }),
    );
    return cols;
  }, [indexOffset, seriesId, statuses]);

  function selectSeries(value: string) {
    router.push(scInventoryHref({ series: value === "all" ? undefined : value }));
  }

  const centersWithUnits = overview.centers.filter((row) => row.total > 0).length;

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Inventory totals">
        <V2MetricCard
          variant="white"
          label="Total inventory"
          value={cards.total.qty}
          amount={cards.total.amount}
          subtext={`Across ${plural(centersWithUnits, "service center", "service centers")}`}
        />
        <V2MetricCard
          variant="white"
          label="In stock (STK)"
          value={cards.inStock.qty}
          amount={cards.inStock.amount}
          subtext="Accepted at service centers"
        />
        <V2MetricCard
          variant="rose"
          label="Defective"
          value={cards.defective.qty}
          amount={cards.defective.amount}
          subtext={
            overview.topDefectiveCenter && cards.defective.qty > 0
              ? `Most at ${overview.topDefectiveCenter}`
              : undefined
          }
        />
        <V2MetricCard
          variant="amber"
          label="In transit (DIT)"
          value={cards.inTransit.qty}
          amount={cards.inTransit.amount}
          subtext={cards.inTransit.qty > 0 ? "Delivered, waiting to be accepted" : undefined}
        />
      </section>

      {seriesSummary}

      <DataTable
        data={pageItems}
        columns={columns}
        getRowId={(row) => row.center.id}
        stickyHeader
        chrome="card"
        className="overflow-x-auto"
        tableClassName="min-w-[48rem]"
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search service center or code…",
        }}
        pageSize={{ value: pageSize, onChange: setPageSize }}
        pagination={{ total, page, totalPages, itemLabel: "service center", onPageChange: setPage }}
        toolbarActions={
          <Select value={seriesId ?? "all"} onValueChange={selectSeries}>
            <SelectTrigger aria-label="Filter by series" className="w-[12rem]">
              <SelectValue placeholder="All series" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All series</SelectItem>
              {seriesOptions.map((series) => (
                <SelectItem key={series.id} value={series.id}>
                  {series.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
        empty={filtered.length === 0}
        emptyMessage={
          overview.centers.length === 0
            ? "No service centers are assigned to you."
            : "No service centers match your search."
        }
        footer={
          filtered.length > 0 ? (
            <footer className="border-t px-4 py-3 text-xs text-muted-foreground">
              Showing {plural(filtered.length, "service center", "service centers")} ·{" "}
              {filteredUnits.toLocaleString()} total units
              {seriesId ? " in this series" : ""}
            </footer>
          ) : null
        }
      />
    </div>
  );
}
