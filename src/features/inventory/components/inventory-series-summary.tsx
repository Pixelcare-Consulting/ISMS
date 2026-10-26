"use client";

import { ChevronDown, ChevronUp, Expand, Search } from "lucide-react";
import { useMemo, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { createColumnHelper } from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  DataTable,
  useClientTableSort,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
import type { InventorySeriesSummary } from "@/features/inventory/services/inventory.service";
import { cn } from "@/utils/cn";
import { formatPeso } from "@/utils/format-currency";

const SERIES_SUMMARY_EXPANDED_KEY = "inventory.seriesSummary.expanded";

const seriesSummaryExpandedListeners = new Set<() => void>();

function subscribeSeriesSummaryExpanded(onStoreChange: () => void) {
  seriesSummaryExpandedListeners.add(onStoreChange);
  return () => {
    seriesSummaryExpandedListeners.delete(onStoreChange);
  };
}

function emitSeriesSummaryExpanded() {
  for (const listener of seriesSummaryExpandedListeners) {
    listener();
  }
}

function readExpandedPreference(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(SERIES_SUMMARY_EXPANDED_KEY);
    if (raw === null) return false;
    return raw === "1" || raw === "true";
  } catch {
    return false;
  }
}

function writeExpandedPreference(next: boolean) {
  try {
    window.localStorage.setItem(
      SERIES_SUMMARY_EXPANDED_KEY,
      next ? "1" : "0",
    );
  } catch {
    // ignore quota / private mode
  }
  emitSeriesSummaryExpanded();
}

interface InventorySeriesSummaryProps {
  summary: InventorySeriesSummary;
}

type SeriesRow = InventorySeriesSummary["rows"][number] & { isTotal?: false };
type SeriesTableRow = SeriesRow | { series: string; qty: number; value: number; isTotal: true };

const seriesColumn = createColumnHelper<DataTableFeatures, SeriesTableRow>();

function SeriesSummaryTable({
  rows,
  totalQty,
  totalValue,
  emptyLabel = "No stock units match the current filters",
  freezeChrome = false,
}: {
  rows: InventorySeriesSummary["rows"];
  totalQty: number;
  totalValue: number;
  emptyLabel?: string;
  /** Sticky SERIES header + TOTAL footer inside the nearest overflow scroller. */
  freezeChrome?: boolean;
}) {
  const sort = useClientTableSort(rows, {
    series: (row) => row.series,
    qty: (row) => row.qty,
    value: (row) => row.value,
  });

  const tableRows = useMemo(() => {
    const body: SeriesTableRow[] = sort.sorted;
    if (rows.length === 0) return body;
    return [
      ...body,
      { series: "TOTAL", qty: totalQty, value: totalValue, isTotal: true as const },
    ];
  }, [rows.length, sort.sorted, totalQty, totalValue]);

  const columns = useMemo(() => {
    const cols: DataTableColumn<SeriesTableRow>[] = [
      seriesColumn.display({
        id: "series",
        header: "SERIES",
        enableSorting: true,
        cell: ({ row }) => (row.original.isTotal ? "TOTAL" : row.original.series),
        meta: { className: "font-mono text-sm" },
      }),
      seriesColumn.display({
        id: "qty",
        header: "QTY",
        enableSorting: true,
        cell: ({ row }) => row.original.qty,
        meta: { align: "end", className: "tabular-nums" },
      }),
      seriesColumn.display({
        id: "value",
        header: "VALUE",
        enableSorting: true,
        cell: ({ row }) => formatPeso(row.original.value),
        meta: { align: "end", className: "tabular-nums" },
      }),
    ];
    return cols;
  }, []);

  return (
    <DataTable
      chrome="plain"
      data={tableRows}
      columns={columns}
      getRowId={(row) => (row.isTotal ? "__total__" : row.series)}
      manualSorting
      enableSorting
      sorting={{
        sortKey: sort.sortKey,
        sortDir: sort.sortDir,
        onSort: sort.toggleSort,
      }}
      stickyHeader={freezeChrome}
      empty={sort.sorted.length === 0}
      emptyMessage={emptyLabel}
    />
  );
}

export function InventorySeriesSummaryPanel({ summary }: InventorySeriesSummaryProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const expanded = useSyncExternalStore(
    subscribeSeriesSummaryExpanded,
    readExpandedPreference,
    () => false,
  );

  function toggleExpanded() {
    writeExpandedPreference(!expanded);
  }

  function onHeaderKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggleExpanded();
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return {
        rows: summary.rows,
        totalQty: summary.totalQty,
        totalValue: summary.totalValue,
      };
    }
    const rows = summary.rows.filter((r) => r.series.toLowerCase().includes(q));
    return {
      rows,
      totalQty: rows.reduce((sum, r) => sum + r.qty, 0),
      totalValue: rows.reduce((sum, r) => sum + r.value, 0),
    };
  }, [query, summary]);

  return (
    <>
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div
          role="button"
          tabIndex={0}
          className={cn(
            "flex cursor-pointer flex-wrap items-start justify-between gap-3 px-4 py-3 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
            expanded && "border-b",
          )}
          aria-expanded={expanded}
          aria-controls="inventory-series-summary-body"
          onClick={toggleExpanded}
          onKeyDown={onHeaderKeyDown}
        >
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-wide">Series summary</h2>
            {expanded ? (
              <p className="text-xs text-muted-foreground">
                QTY and peso value by the series saved on each model in Master data.
                Follows applied filters.
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {summary.rows.length === 0
                  ? "Hidden — no series for current filters"
                  : `Hidden — ${summary.rows.length} series · ${summary.totalQty.toLocaleString()} qty · ${formatPeso(summary.totalValue)}`}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground"
              aria-hidden
            >
              {expanded ? (
                <>
                  <ChevronUp className="size-4" />
                  Hide
                </>
              ) : (
                <>
                  <ChevronDown className="size-4" />
                  Show
                </>
              )}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={(event) => {
                event.stopPropagation();
                setOpen(true);
              }}
              disabled={summary.rows.length === 0}
            >
              <Expand className="size-4" />
              View series
            </Button>
          </div>
        </div>
        {expanded ? (
          <div id="inventory-series-summary-body" className="max-h-72 overflow-auto">
            <SeriesSummaryTable
              rows={summary.rows}
              totalQty={summary.totalQty}
              totalValue={summary.totalValue}
              freezeChrome
            />
          </div>
        ) : null}
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <DialogContent className="flex max-h-[calc(100svh-2rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 space-y-1 border-b px-4 py-4 text-left sm:px-6 sm:text-left">
            <DialogTitle>Series summary</DialogTitle>
            <DialogDescription>
              Search and review QTY and peso value by the series saved on each model for the current filters.
            </DialogDescription>
          </DialogHeader>

          <div className="shrink-0 space-y-3 px-4 py-3 sm:px-6">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by series…"
                className="pl-9"
                aria-label="Filter series"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {filtered.rows.length} of {summary.rows.length} series
              {query.trim() ? " matching filter" : ""}
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-auto border-t px-1 sm:px-2">
            <SeriesSummaryTable
              rows={filtered.rows}
              totalQty={filtered.totalQty}
              totalValue={filtered.totalValue}
              freezeChrome
              emptyLabel={
                query.trim()
                  ? "No series match this filter"
                  : "No stock units match the current filters"
              }
            />
          </div>

          <DialogFooter className="shrink-0 border-t px-4 py-3 sm:px-6">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
