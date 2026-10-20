"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import {
  SERIAL_ACTIVITY_LABELS,
  SERIAL_ACTIVITY_TYPES,
  type SerialActivityEvent,
  type SerialActivityType,
  formatSerialActivityPerformedBy,
  formatSerialActivityTimestamp,
  formatSerialActivityType,
} from "@/features/serial-activity/constants/serial-activity-display";
import {
  DEFAULT_TABLE_PAGE_SIZE,
  parseTablePageSize,
  type TablePageSize,
} from "@/components/data-table/table-page-size";
import { TableSearchBar, uniqueSearchSuggestions } from "@/components/data-table/table-search-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  DataTable,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
import { cn } from "@/utils/cn";

interface SerialActivityTableProps {
  result: {
    items: SerialActivityEvent[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  currentType?: string;
  currentSearch?: string;
  currentDateFrom?: string;
  currentDateTo?: string;
  initialSortDir?: string;
}

const activityColumn = createColumnHelper<DataTableFeatures, SerialActivityEvent>();

type SerialActivitySortDir = "asc" | "desc";

interface SerialActivityFilters {
  type?: string;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  dir?: string;
}

const TYPE_BADGE_CLASS: Record<SerialActivityType, string> = {
  registered: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  status: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  transferred:
    "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  sold: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  pulled_out:
    "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  counted: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
};

function buildHref(
  page: number,
  limit: number,
  filters: SerialActivityFilters = {},
): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (limit !== DEFAULT_TABLE_PAGE_SIZE) params.set("limit", String(limit));
  if (filters.type) params.set("type", filters.type);
  if (filters.q) params.set("q", filters.q);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.dir) params.set("dir", filters.dir);
  const query = params.toString();
  return query
    ? `/audit-logs/serial-numbers?${query}`
    : "/audit-logs/serial-numbers";
}

export function SerialActivityTable({
  result,
  currentType,
  currentSearch,
  currentDateFrom,
  currentDateTo,
  initialSortDir = "desc",
}: SerialActivityTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [type, setType] = useState(currentType ?? "");
  const [search, setSearch] = useState(currentSearch ?? "");
  const [dateFrom, setDateFrom] = useState(currentDateFrom ?? "");
  const [dateTo, setDateTo] = useState(currentDateTo ?? "");
  const pageSize = parseTablePageSize(result.pageSize);
  const sortDir = (
    (searchParams.get("dir") ?? initialSortDir) === "asc" ? "asc" : "desc"
  ) as SerialActivitySortDir;

  const rows = result.items;

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        rows.map((row) => row.serialNo),
        rows.map((row) => row.reference),
      ),
    [rows],
  );

  const activeFilters: SerialActivityFilters = {
    type: currentType,
    q: currentSearch,
    dateFrom: currentDateFrom,
    dateTo: currentDateTo,
    dir: sortDir,
  };
  const hasActiveFilters = Boolean(
    currentType || currentSearch || currentDateFrom || currentDateTo,
  );

  function handlePageSizeChange(limit: TablePageSize) {
    router.push(buildHref(1, limit, activeFilters));
  }

  function applyFilters() {
    router.push(
      buildHref(1, pageSize, {
        type: type || undefined,
        q: search.trim() || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        dir: sortDir,
      }),
    );
  }

  function clearFilters() {
    setType("");
    setSearch("");
    setDateFrom("");
    setDateTo("");
    router.push("/audit-logs/serial-numbers");
  }

  function toggleSortDir() {
    const next: SerialActivitySortDir = sortDir === "asc" ? "desc" : "asc";
    router.push(buildHref(1, pageSize, { ...activeFilters, dir: next }));
  }

  const indexOffset = (result.page - 1) * result.pageSize;
  const columns = useMemo(() => {
    const cols: DataTableColumn<SerialActivityEvent>[] = [
      activityColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => indexOffset + row.index + 1,
        meta: { className: "tabular-nums text-muted-foreground" },
      }),
      activityColumn.display({
        id: "timestamp",
        header: "Date & time",
        enableSorting: true,
        cell: ({ row }) => formatSerialActivityTimestamp(row.original.timestamp),
        meta: { className: "text-muted-foreground" },
      }),
      activityColumn.display({
        id: "event",
        header: "Event",
        enableSorting: false,
        cell: ({ row }) => (
          <span
            className={cn(
              "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium",
              TYPE_BADGE_CLASS[row.original.type],
            )}
          >
            {formatSerialActivityType(row.original)}
          </span>
        ),
      }),
      activityColumn.display({
        id: "serial",
        header: "Serial",
        enableSorting: false,
        cell: ({ row }) => (
          <div>
            <div className="font-mono text-sm font-medium tabular-nums">{row.original.serialNo}</div>
            <div className="text-xs text-muted-foreground">{row.original.modelLabel}</div>
          </div>
        ),
      }),
      activityColumn.display({
        id: "status",
        header: "Status",
        enableSorting: false,
        cell: ({ row }) => row.original.status ?? "—",
        meta: { className: "text-muted-foreground" },
      }),
      activityColumn.display({
        id: "location",
        header: "Location",
        enableSorting: false,
        cell: ({ row }) => row.original.location ?? "—",
        meta: { className: "text-muted-foreground" },
      }),
      activityColumn.display({
        id: "reference",
        header: "Reference",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="min-w-56 text-sm">
            {row.original.reference ? (
              <div className="font-medium tabular-nums">{row.original.reference}</div>
            ) : null}
            {row.original.referenceDetails.map((detail) => (
              <div key={detail} className="text-xs text-muted-foreground">
                {detail}
              </div>
            ))}
            {!row.original.reference && row.original.referenceDetails.length === 0 ? (
              <span className="text-muted-foreground">—</span>
            ) : null}
          </div>
        ),
        meta: { wrap: true },
      }),
      activityColumn.display({
        id: "performedBy",
        header: "Performed by",
        enableSorting: false,
        cell: ({ row }) => formatSerialActivityPerformedBy(row.original.performedBy),
        meta: { className: "text-muted-foreground" },
      }),
    ];
    return cols;
  }, [indexOffset]);

  return (
    <DataTable
      data={rows}
      columns={columns}
      getRowId={(row) => row.id}
      manualSorting
      manualPagination
      enableSorting
      sorting={{
        sortKey: "timestamp",
        sortDir,
        onSort: () => toggleSortDir(),
      }}
      stickyHeader
      empty={rows.length === 0}
      emptyMessage={
        hasActiveFilters
          ? "No serial-number activity matches your filters."
          : "No serial-number activity has been recorded yet."
      }
      banner={
        <div className="space-y-4 border-b px-4 py-4">
          <TableSearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search by serial number or reference…"
            suggestions={suggestions}
          />

          <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end lg:gap-3">
            <SearchableSelect
              label="Event"
              id="serial-activity-type"
              className="lg:w-56"
              options={[
                { id: "all", label: "All events" },
                ...SERIAL_ACTIVITY_TYPES.map((item) => ({
                  id: item,
                  label: SERIAL_ACTIVITY_LABELS[item],
                })),
              ]}
              value={type || "all"}
              onChange={(value) => setType(value === "all" ? "" : value)}
              searchPlaceholder="Search events…"
            />

            <div className="space-y-2 lg:w-40">
              <Label htmlFor="serial-activity-date-from">From date</Label>
              <Input
                id="serial-activity-date-from"
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
              />
            </div>

            <div className="space-y-2 lg:w-40">
              <Label htmlFor="serial-activity-date-to">To date</Label>
              <Input
                id="serial-activity-date-to"
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(event) => setDateTo(event.target.value)}
              />
            </div>

            <div className="flex gap-2 shrink-0">
              <Button type="button" variant="outline" onClick={clearFilters}>
                Clear
              </Button>
              <Button type="button" onClick={applyFilters}>
                Apply filters
              </Button>
            </div>
          </div>
        </div>
      }
      pagination={{
        total: result.total,
        page: result.page,
        totalPages: result.totalPages,
        itemLabel: "event",
        buildHref: (page) => buildHref(page, pageSize, activeFilters),
      }}
      pageSize={{ value: pageSize, onChange: handlePageSizeChange }}
    />
  );
}
