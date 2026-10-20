"use client";

import { createColumnHelper } from "@tanstack/react-table";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { listBranchesForPcountReportAction } from "@/features/stock-audit/actions/stock-audit.actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  DataTable,
  nextTableSort,
  type DataTableColumn,
  type DataTableFeatures,
  type TableSortDirection,
} from "@/lib/data-table";
import { ReportPreview } from "@/features/reporting/components/report-preview";
import { describeDateRange } from "@/features/reporting/lib/filter-summary";
import type { DatasetParams } from "@/features/reporting/schemas/dataset-params.schema";

const pcountColumn = createColumnHelper<DataTableFeatures, ClosedSessionRow>();

interface ClosedSessionRow {
  id: string;
  sessionNo: string;
  closedAt: Date | string | null;
  createdAt: Date | string;
  branch: { id: string; name: string; sapCode: string };
  createdBy: { name: string | null; email: string };
  lineCount: number;
  countedCount: number;
  varianceCount: number;
}

interface PaginatedList<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface PcountReportPanelProps {
  sessions: PaginatedList<ClosedSessionRow>;
  currentBranchId?: string;
  currentFrom?: string;
  currentTo?: string;
  currentSort?: string;
  currentSortDir?: TableSortDirection;
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}

function buildHref(
  page: number,
  filters: {
    branchId?: string;
    from?: string;
    to?: string;
    sort?: string;
    sortDir?: string;
  },
): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (filters.branchId) params.set("branchId", filters.branchId);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.sort && filters.sortDir) params.set("dir", filters.sortDir);
  const query = params.toString();
  return query ? `/reports/pcount?${query}` : "/reports/pcount";
}

export function PcountReportPanel({
  sessions,
  currentBranchId,
  currentFrom,
  currentTo,
  currentSort = "",
  currentSortDir = "desc",
}: PcountReportPanelProps) {
  const router = useRouter();
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [branchId, setBranchId] = useState(currentBranchId ?? "");
  const [from, setFrom] = useState(currentFrom ?? "");
  const [to, setTo] = useState(currentTo ?? "");
  const [refsLoaded, setRefsLoaded] = useState(false);
  const [previewParams, setPreviewParams] = useState<DatasetParams | null>(null);

  const activeFilters = {
    branchId: currentBranchId,
    from: currentFrom,
    to: currentTo,
    sort: currentSort,
    sortDir: currentSortDir,
  };
  const hasActiveFilters = Boolean(
    currentBranchId || currentFrom || currentTo,
  );

  function toggleSort(field: string) {
    const next = nextTableSort(field, currentSort, currentSortDir);
    router.push(
      buildHref(1, {
        branchId: currentBranchId,
        from: currentFrom,
        to: currentTo,
        sort: next.sort,
        sortDir: next.dir,
      }),
    );
  }

  const totalLines = sessions.items.reduce((sum, row) => sum + row.lineCount, 0);
  const totalCounted = sessions.items.reduce(
    (sum, row) => sum + row.countedCount,
    0,
  );
  const totalVariances = sessions.items.reduce(
    (sum, row) => sum + row.varianceCount,
    0,
  );

  async function loadBranches() {
    if (refsLoaded) return;
    const rows = await listBranchesForPcountReportAction();
    setBranches(rows);
    setRefsLoaded(true);
  }

  function applyFilters() {
    router.push(
      buildHref(1, {
        branchId: branchId || undefined,
        from: from || undefined,
        to: to || undefined,
      }),
    );
  }

  function clearFilters() {
    setBranchId("");
    setFrom("");
    setTo("");
    router.push("/reports/pcount");
  }

  const indexOffset = (sessions.page - 1) * sessions.limit;
  const columns = useMemo(() => {
    const cols: DataTableColumn<ClosedSessionRow>[] = [
      pcountColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => indexOffset + row.index + 1,
        meta: { className: "tabular-nums text-muted-foreground" },
      }),
      pcountColumn.display({
        id: "session",
        header: "Session",
        enableSorting: true,
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/inventory/stock-count/${row.original.id}`}
              className="font-medium hover:underline"
            >
              {row.original.sessionNo}
            </Link>
            <Badge variant="outline">Closed</Badge>
          </div>
        ),
      }),
      pcountColumn.display({
        id: "branch",
        header: "Branch",
        enableSorting: true,
        cell: ({ row }) => (
          <>
            {row.original.branch.name}
            <span className="ml-1 text-xs text-muted-foreground">
              ({row.original.branch.sapCode})
            </span>
          </>
        ),
      }),
      pcountColumn.display({
        id: "closed",
        header: "Closed",
        enableSorting: true,
        cell: ({ row }) => formatDate(row.original.closedAt),
        meta: { className: "text-muted-foreground" },
      }),
      pcountColumn.accessor((row) => row.lineCount, {
        id: "lines",
        header: "Lines",
        enableSorting: true,
        meta: { align: "end" },
      }),
      pcountColumn.accessor((row) => row.countedCount, {
        id: "counted",
        header: "Counted",
        enableSorting: false,
        meta: { align: "end" },
      }),
      pcountColumn.accessor((row) => row.varianceCount, {
        id: "variances",
        header: "Variances",
        enableSorting: true,
        meta: { align: "end" },
      }),
      pcountColumn.display({
        id: "createdBy",
        header: "Created by",
        enableSorting: false,
        cell: ({ row }) => row.original.createdBy.name ?? row.original.createdBy.email,
        meta: { className: "text-muted-foreground" },
      }),
    ];
    return cols;
  }, [indexOffset]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Lines (page)</p>
          <p className="text-2xl font-semibold tabular-nums">{totalLines}</p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Counted (page)</p>
          <p className="text-2xl font-semibold tabular-nums">{totalCounted}</p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Variances (page)</p>
          <p className="text-2xl font-semibold tabular-nums">{totalVariances}</p>
        </div>
      </div>

      <DataTable
        data={sessions.items}
        columns={columns}
        getRowId={(row) => row.id}
        manualSorting
        manualPagination
        enableSorting
        sorting={{
          sortKey: currentSort,
          sortDir: currentSortDir,
          onSort: toggleSort,
        }}
        stickyHeader
        banner={
        <div className="space-y-4 border-b px-4 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end lg:gap-3">
            <SearchableSelect
              label="Branch"
              id="pcount-branch"
              className="lg:w-56"
              options={[
                ...branches.map((b) => ({ id: b.id, label: b.name })),
                ...(currentBranchId &&
                !branches.some((b) => b.id === currentBranchId)
                  ? [{ id: currentBranchId, label: "Selected branch" }]
                  : []),
              ]}
              value={branchId}
              onChange={setBranchId}
              allowClear
              placeholder="All branches"
              searchPlaceholder="Search branches…"
              onOpenChange={(open) => {
                if (open) void loadBranches();
              }}
            />
            <div className="space-y-2 lg:w-40">
              <Label htmlFor="pcount-from">Closed from</Label>
              <Input
                id="pcount-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2 lg:w-40">
              <Label htmlFor="pcount-to">Closed to</Label>
              <Input
                id="pcount-to"
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <div className="flex gap-2 shrink-0">
              <Button type="button" variant="outline" onClick={clearFilters}>
                Clear
              </Button>
              <Button type="button" onClick={applyFilters}>
                Apply filters
              </Button>
              {/* Prints every session matching the applied filters, not just this page. */}
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setPreviewParams({ branchId: currentBranchId, from: currentFrom, to: currentTo })
                }
              >
                Preview report
              </Button>
            </div>
          </div>
        </div>
        }
        pagination={{
          total: sessions.total,
          page: sessions.page,
          totalPages: sessions.totalPages,
          itemLabel: "session",
          buildHref: (page) => buildHref(page, activeFilters),
        }}
        empty={sessions.items.length === 0}
        emptyMessage={
          hasActiveFilters
            ? "No closed P-Count sessions match your filters."
            : "No closed P-Count sessions yet."
        }
      />

      <ReportPreview
        reportKey="pcount"
        params={previewParams}
        filterSummary={describeDateRange(previewParams?.from, previewParams?.to)}
        onClose={() => setPreviewParams(null)}
      />
    </div>
  );
}
