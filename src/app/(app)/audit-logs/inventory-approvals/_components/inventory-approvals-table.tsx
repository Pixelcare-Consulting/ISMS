"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

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
  formatInventoryApprovalTime,
  INVENTORY_APPROVAL_SOURCE_LABELS,
  INVENTORY_APPROVAL_SOURCES,
  INVENTORY_APPROVAL_STATUS_LABELS,
  INVENTORY_APPROVAL_STATUSES,
  INVENTORY_APPROVAL_STEP_LABELS,
  type InventoryApprovalRow,
  type InventoryApprovalStatus,
} from "@/features/inventory-approvals/constants/inventory-approval-display";
import { DataTable, type DataTableColumn, type DataTableFeatures } from "@/lib/data-table";
import { cn } from "@/utils/cn";

const PAGE_PATH = "/audit-logs/inventory-approvals";

const STATUS_BADGE_CLASS: Record<InventoryApprovalStatus, string> = {
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  APPROVED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  REJECTED: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  CANCELLED: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

interface InventoryApprovalFilters {
  status?: string;
  source?: string;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
}

interface InventoryApprovalsTableProps {
  result: {
    items: InventoryApprovalRow[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  currentStatus?: string;
  currentSource?: string;
  currentSearch?: string;
  currentDateFrom?: string;
  currentDateTo?: string;
}

const approvalColumn = createColumnHelper<DataTableFeatures, InventoryApprovalRow>();

function buildHref(page: number, limit: number, filters: InventoryApprovalFilters = {}): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (limit !== DEFAULT_TABLE_PAGE_SIZE) params.set("limit", String(limit));
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `${PAGE_PATH}?${query}` : PAGE_PATH;
}

function emptyDash(value: string | null): string {
  return value || "—";
}

export function InventoryApprovalsTable({
  result,
  currentStatus,
  currentSource,
  currentSearch,
  currentDateFrom,
  currentDateTo,
}: InventoryApprovalsTableProps) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus ?? "");
  const [source, setSource] = useState(currentSource ?? "");
  const [search, setSearch] = useState(currentSearch ?? "");
  const [dateFrom, setDateFrom] = useState(currentDateFrom ?? "");
  const [dateTo, setDateTo] = useState(currentDateTo ?? "");
  const pageSize = parseTablePageSize(result.pageSize);
  const rows = result.items;

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        rows.map((row) => row.serialNo),
        rows.map((row) => row.sourceNo),
      ),
    [rows],
  );

  const activeFilters: InventoryApprovalFilters = {
    status: currentStatus,
    source: currentSource,
    q: currentSearch,
    dateFrom: currentDateFrom,
    dateTo: currentDateTo,
  };
  const hasActiveFilters = Object.values(activeFilters).some(Boolean);

  function applyFilters() {
    router.push(
      buildHref(1, pageSize, {
        status,
        source,
        q: search.trim(),
        dateFrom,
        dateTo,
      }),
    );
  }

  function clearFilters() {
    setStatus("");
    setSource("");
    setSearch("");
    setDateFrom("");
    setDateTo("");
    router.push(PAGE_PATH);
  }

  const indexOffset = (result.page - 1) * result.pageSize;
  const columns = useMemo(() => {
    const cols: DataTableColumn<InventoryApprovalRow>[] = [
      approvalColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => indexOffset + row.index + 1,
        meta: { className: "tabular-nums text-muted-foreground" },
      }),
      approvalColumn.display({
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
      approvalColumn.display({
        id: "document",
        header: "Document",
        enableSorting: false,
        cell: ({ row }) => (
          <div>
            <div className="text-sm font-medium">
              {INVENTORY_APPROVAL_SOURCE_LABELS[row.original.sourceType]}
            </div>
            <div className="text-xs tabular-nums text-muted-foreground">
              {emptyDash(row.original.sourceNo)}
            </div>
          </div>
        ),
      }),
      approvalColumn.display({
        id: "step",
        header: "Step",
        enableSorting: false,
        cell: ({ row }) => INVENTORY_APPROVAL_STEP_LABELS[row.original.step],
      }),
      approvalColumn.display({
        id: "status",
        header: "Status",
        enableSorting: false,
        cell: ({ row }) => (
          <span
            className={cn(
              "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium",
              STATUS_BADGE_CLASS[row.original.status],
            )}
          >
            {INVENTORY_APPROVAL_STATUS_LABELS[row.original.status]}
          </span>
        ),
      }),
      approvalColumn.display({
        id: "requested",
        header: "Requested",
        enableSorting: false,
        cell: ({ row }) => (
          <div>
            <div className="text-sm">{emptyDash(row.original.requestedBy)}</div>
            <div className="text-xs text-muted-foreground">
              {formatInventoryApprovalTime(row.original.requestedAt)}
            </div>
          </div>
        ),
      }),
      approvalColumn.display({
        id: "decided",
        header: "Decided",
        enableSorting: false,
        cell: ({ row }) => (
          <div>
            <div className="text-sm">{emptyDash(row.original.decidedBy)}</div>
            {row.original.decidedAt ? (
              <div className="text-xs text-muted-foreground">
                {formatInventoryApprovalTime(row.original.decidedAt)}
              </div>
            ) : null}
          </div>
        ),
      }),
      approvalColumn.display({
        id: "remarks",
        header: "Remarks",
        enableSorting: false,
        cell: ({ row }) => <div className="min-w-48 text-sm">{emptyDash(row.original.remarks)}</div>,
        meta: { wrap: true },
      }),
      approvalColumn.display({
        id: "problem",
        header: "Problem description",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="min-w-48 text-sm">{emptyDash(row.original.problemDescription)}</div>
        ),
        meta: { wrap: true },
      }),
      approvalColumn.display({
        id: "attachments",
        header: "Attachments",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.attachments.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {row.original.attachments.map((file) => (
                <li key={file.id}>
                  <a
                    href={file.href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline underline-offset-2"
                  >
                    {file.name}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            "—"
          ),
      }),
    ];
    return cols;
  }, [indexOffset]);

  return (
    <DataTable
      data={rows}
      columns={columns}
      getRowId={(row) => row.id}
      manualPagination
      stickyHeader
      empty={rows.length === 0}
      emptyMessage={
        hasActiveFilters
          ? "No approvals match your filters."
          : "No approvals have been recorded yet."
      }
      banner={
        <div className="space-y-4 border-b px-4 py-4">
          <TableSearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search by serial, document no., remarks or problem…"
            suggestions={suggestions}
          />

          <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end lg:gap-3">
            <SearchableSelect
              label="Status"
              id="inventory-approval-status"
              className="lg:w-44"
              options={[
                { id: "all", label: "All statuses" },
                ...INVENTORY_APPROVAL_STATUSES.map((item) => ({
                  id: item,
                  label: INVENTORY_APPROVAL_STATUS_LABELS[item],
                })),
              ]}
              value={status || "all"}
              onChange={(value) => setStatus(value === "all" ? "" : value)}
              searchPlaceholder="Search statuses…"
            />

            <SearchableSelect
              label="Document"
              id="inventory-approval-source"
              className="lg:w-56"
              options={[
                { id: "all", label: "All documents" },
                ...INVENTORY_APPROVAL_SOURCES.map((item) => ({
                  id: item,
                  label: INVENTORY_APPROVAL_SOURCE_LABELS[item],
                })),
              ]}
              value={source || "all"}
              onChange={(value) => setSource(value === "all" ? "" : value)}
              searchPlaceholder="Search documents…"
            />

            <div className="space-y-2 lg:w-40">
              <Label htmlFor="inventory-approval-date-from">From date</Label>
              <Input
                id="inventory-approval-date-from"
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
              />
            </div>

            <div className="space-y-2 lg:w-40">
              <Label htmlFor="inventory-approval-date-to">To date</Label>
              <Input
                id="inventory-approval-date-to"
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
        itemLabel: "approval",
        buildHref: (page) => buildHref(page, pageSize, activeFilters),
      }}
      pageSize={{
        value: pageSize,
        onChange: (limit: TablePageSize) => router.push(buildHref(1, limit, activeFilters)),
      }}
    />
  );
}
