"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import {
  SERIAL_ACTIVITY_LABELS,
  SERIAL_ACTIVITY_TYPES,
  type SerialActivityEvent,
  type SerialActivityType,
  formatSerialActivityPerformedBy,
  formatSerialActivityTimestamp,
} from "@/features/serial-activity/constants/serial-activity-display";
import { TableCodeCell } from "@/components/data-table";
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
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { GlobalDataTable, GlobalTableHead } from "@/lib/data-table";
import { cn } from "@/utils/cn";
import { formatPeso } from "@/utils/format-currency";

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

function formatReferenceAmount(amount: string): string {
  const n = Number(amount.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? formatPeso(n) : amount;
}

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
    () => uniqueSearchSuggestions(rows.map((row) => row.serialNo)),
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

  return (
    <GlobalDataTable
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
            placeholder="Search by serial number…"
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
    >
      <TableHeader>
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <GlobalTableHead className="w-12">#</GlobalTableHead>
          <GlobalTableHead
            sortKey="timestamp"
            activeSortKey="timestamp"
            sortDirection={sortDir}
            onSort={toggleSortDir}
          >
            Date &amp; time
          </GlobalTableHead>
          <GlobalTableHead>Event</GlobalTableHead>
          <GlobalTableHead>Serial</GlobalTableHead>
          <GlobalTableHead>Model</GlobalTableHead>
          <GlobalTableHead>Location</GlobalTableHead>
          <GlobalTableHead>Reference</GlobalTableHead>
          <GlobalTableHead>Performed by</GlobalTableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => (
          <TableRow
            key={row.id}
            className={cn(index % 2 === 1 && "bg-table-stripe")}
          >
            <TableCell className="tabular-nums text-muted-foreground">
              {(result.page - 1) * result.pageSize + index + 1}
            </TableCell>
            <TableCell className="whitespace-nowrap text-muted-foreground">
              {formatSerialActivityTimestamp(row.timestamp)}
            </TableCell>
            <TableCell>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                  TYPE_BADGE_CLASS[row.type],
                )}
              >
                {SERIAL_ACTIVITY_LABELS[row.type]}
              </span>
            </TableCell>
            <TableCodeCell value={row.serialNo} />
            <TableCell className="text-sm text-muted-foreground">
              {row.modelLabel}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {row.location ?? "—"}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              <div className="flex flex-col">
                {row.reference ? <span>{row.reference}</span> : null}
                {row.status ? (
                  <span className="text-xs">{row.status}</span>
                ) : null}
                {row.amount ? (
                  <span className="font-mono text-sm tabular-nums">
                    {formatReferenceAmount(row.amount)}
                  </span>
                ) : null}
                {!row.reference && !row.status && !row.amount ? "—" : null}
              </div>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {formatSerialActivityPerformedBy(row.performedBy)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </GlobalDataTable>
  );
}
