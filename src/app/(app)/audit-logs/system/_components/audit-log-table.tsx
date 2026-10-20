"use client";

import { createColumnHelper, type RowSelectionState } from "@tanstack/react-table";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { AuditActionBadge } from "@/features/audit/components/audit-action-badge";
import { AuditEntityBadge } from "@/features/audit/components/audit-entity-badge";
import {
  formatAuditActionLabel,
  formatAuditDetails,
  formatAuditEntitySummary,
  formatAuditEntityTypeLabel,
  formatAuditReference,
  formatAuditTimestamp,
} from "@/features/audit/constants/audit-display";
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
  nextTableSort,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";

interface AuditLogUser {
  id: string;
  name: string | null;
  email: string;
}

interface AuditLogRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  createdAt: Date;
  user: AuditLogUser | null;
}

interface AuditLogTableProps {
  result: {
    items: AuditLogRow[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  filterOptions: {
    actions: string[];
    entityTypes: string[];
  };
  currentAction?: string;
  currentEntityType?: string;
  currentSearch?: string;
  currentDateFrom?: string;
  currentDateTo?: string;
  initialSort?: string;
  initialSortDir?: string;
}

const auditColumn = createColumnHelper<DataTableFeatures, AuditLogRow>();

type AuditLogSortField = "createdAt" | "user" | "action" | "entityType";
type AuditLogSortDir = "asc" | "desc";

interface AuditLogFilters {
  action?: string;
  entityType?: string;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: string;
  sortDir?: string;
}

function buildAuditLogHref(
  page: number,
  limit: number,
  filters: AuditLogFilters = {},
): string {
  const params = new URLSearchParams();

  if (page > 1) {
    params.set("page", String(page));
  }
  if (limit !== DEFAULT_TABLE_PAGE_SIZE) {
    params.set("limit", String(limit));
  }
  if (filters.action) {
    params.set("action", filters.action);
  }
  if (filters.entityType) {
    params.set("entityType", filters.entityType);
  }
  if (filters.q) {
    params.set("q", filters.q);
  }
  if (filters.dateFrom) {
    params.set("dateFrom", filters.dateFrom);
  }
  if (filters.dateTo) {
    params.set("dateTo", filters.dateTo);
  }
  if (filters.sort) {
    params.set("sort", filters.sort);
  }
  if (filters.sort && filters.sortDir) {
    params.set("dir", filters.sortDir);
  }

  const query = params.toString();
  return query ? `/audit-logs/system?${query}` : "/audit-logs/system";
}

export function AuditLogTable({
  result,
  filterOptions,
  currentAction,
  currentEntityType,
  currentSearch,
  currentDateFrom,
  currentDateTo,
  initialSort = "",
  initialSortDir = "desc",
}: AuditLogTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [action, setAction] = useState(currentAction ?? "");
  const [entityType, setEntityType] = useState(currentEntityType ?? "");
  const [search, setSearch] = useState(currentSearch ?? "");
  const [dateFrom, setDateFrom] = useState(currentDateFrom ?? "");
  const [dateTo, setDateTo] = useState(currentDateTo ?? "");
  const pageSize = parseTablePageSize(result.pageSize);
  const sort = (searchParams.get("sort") ?? initialSort) || "";
  const sortDir = (
    (searchParams.get("dir") ?? initialSortDir) === "asc" ? "asc" : "desc"
  ) as AuditLogSortDir;

  const rows = useMemo(() => result.items, [result.items]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const selectedCount = rows.filter((row) => rowSelection[row.id]).length;

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        rows.map((row) => row.user?.name),
        rows.map((row) => row.user?.email),
        rows.map((row) => row.action),
        rows.map((row) => formatAuditActionLabel(row.action)),
        rows.map((row) => row.entityType),
        rows.map((row) => formatAuditEntityTypeLabel(row.entityType)),
      ),
    [rows],
  );

  const activeFilters: AuditLogFilters = {
    action: currentAction,
    entityType: currentEntityType,
    q: currentSearch,
    dateFrom: currentDateFrom,
    dateTo: currentDateTo,
    sort: sort || undefined,
    sortDir: sort ? sortDir : undefined,
  };

  function handlePageSizeChange(limit: TablePageSize) {
    router.push(buildAuditLogHref(1, limit, activeFilters));
  }

  function applyFilters() {
    router.push(
      buildAuditLogHref(1, pageSize, {
        action: action || undefined,
        entityType: entityType || undefined,
        q: search.trim() || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        sort: sort || undefined,
        sortDir: sort ? sortDir : undefined,
      }),
    );
  }

  function clearFilters() {
    setAction("");
    setEntityType("");
    setSearch("");
    setDateFrom("");
    setDateTo("");
    router.push("/audit-logs/system");
  }

  function toggleSort(field: AuditLogSortField) {
    const next = nextTableSort(field, sort, sortDir);
    router.push(
      buildAuditLogHref(1, pageSize, {
        ...activeFilters,
        sort: next.sort,
        sortDir: next.dir,
      }),
    );
  }

  const hasActiveFilters = Boolean(
    currentAction ||
      currentEntityType ||
      currentSearch ||
      currentDateFrom ||
      currentDateTo,
  );

  const indexOffset = (result.page - 1) * result.pageSize;
  const columns = useMemo(() => {
    const cols: DataTableColumn<AuditLogRow>[] = [
      auditColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => indexOffset + row.index + 1,
        meta: { className: "tabular-nums text-muted-foreground" },
      }),
      auditColumn.display({
        id: "createdAt",
        header: "Date & time",
        enableSorting: true,
        cell: ({ row }) => formatAuditTimestamp(row.original.createdAt),
        meta: { className: "text-muted-foreground" },
      }),
      auditColumn.display({
        id: "user",
        header: "User",
        enableSorting: true,
        cell: ({ row }) => (
          <div>
            <div className="font-medium">
              {row.original.user ? (row.original.user.name ?? row.original.user.email) : "System"}
            </div>
            {row.original.user?.name ? (
              <div className="text-xs text-muted-foreground">{row.original.user.email}</div>
            ) : null}
          </div>
        ),
      }),
      auditColumn.display({
        id: "action",
        header: "Activity",
        enableSorting: true,
        cell: ({ row }) => <AuditActionBadge action={row.original.action} />,
      }),
      auditColumn.display({
        id: "entityType",
        header: "Area",
        enableSorting: true,
        cell: ({ row }) => <AuditEntityBadge entityType={row.original.entityType} />,
      }),
      auditColumn.display({
        id: "reference",
        header: "Reference",
        enableSorting: false,
        cell: ({ row }) => {
          const entitySummary = formatAuditEntitySummary(row.original.entityType, row.original.metadata);
          const reference = formatAuditReference(
            row.original.entityType,
            row.original.entityId,
            row.original.metadata,
            row.original.action,
          );
          return (
            <div className="max-w-xs text-sm">
              <div className="font-medium text-foreground">
                {reference.number ?? entitySummary ?? "—"}
              </div>
              {reference.details.map((detail) => (
                <div key={detail} className="text-xs text-muted-foreground">
                  {detail}
                </div>
              ))}
              <div className="text-xs text-muted-foreground">
                {formatAuditTimestamp(row.original.createdAt)} ·{" "}
                {row.original.user
                  ? (row.original.user.name ?? row.original.user.email)
                  : "System"}
              </div>
              {reference.recordId ? (
                <div className="text-xs text-muted-foreground/70" title={reference.recordId}>
                  Record #{reference.recordId.slice(-8)}
                </div>
              ) : null}
            </div>
          );
        },
        meta: { wrap: true },
      }),
      auditColumn.display({
        id: "details",
        header: "Details",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="max-w-sm text-sm text-muted-foreground">
            {formatAuditDetails(row.original.metadata, row.original.action)}
          </div>
        ),
        meta: { wrap: true },
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
        sortKey: sort,
        sortDir,
        onSort: (columnId) => toggleSort(columnId as AuditLogSortField),
      }}
      enableRowSelection
      rowSelection={rowSelection}
      onRowSelectionChange={setRowSelection}
      selectAllLabel="Select all audit log rows"
      getSelectionLabel={(row) => `Select audit row ${row.id}`}
      stickyHeader
      empty={rows.length === 0}
      emptyMessage={
        hasActiveFilters
          ? "No activity matches your filters."
          : "No activity has been recorded yet."
      }
      banner={
        <>
          <div className="space-y-4 border-b px-4 py-4">
            <TableSearchBar
              value={search}
              onChange={setSearch}
              placeholder="Search by user, activity, or area…"
              suggestions={suggestions}
            />

            <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end lg:gap-3">
              <div className="grid shrink-0 gap-3 sm:grid-cols-2 lg:max-w-md">
                <SearchableSelect
                  label="Activity"
                  id="audit-action-filter"
                  options={[
                    { id: "all", label: "All activities" },
                    ...filterOptions.actions.map((item) => ({
                      id: item,
                      label: formatAuditActionLabel(item),
                    })),
                  ]}
                  value={action || "all"}
                  onChange={(value) => setAction(value === "all" ? "" : value)}
                  searchPlaceholder="Search activities…"
                />

                <SearchableSelect
                  label="Area"
                  id="audit-entity-filter"
                  options={[
                    { id: "all", label: "All areas" },
                    ...filterOptions.entityTypes.map((item) => ({
                      id: item,
                      label: formatAuditEntityTypeLabel(item),
                    })),
                  ]}
                  value={entityType || "all"}
                  onChange={(value) => setEntityType(value === "all" ? "" : value)}
                  searchPlaceholder="Search areas…"
                />
              </div>

              <div className="space-y-2 lg:w-40">
                <Label htmlFor="audit-date-from">From date</Label>
                <Input
                  id="audit-date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                />
              </div>

              <div className="space-y-2 lg:w-40">
                <Label htmlFor="audit-date-to">To date</Label>
                <Input
                  id="audit-date-to"
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
          {selectedCount > 0 ? (
            <div className="px-4 pb-2 pt-2">
              <Button variant="secondary" size="sm" onClick={() => setRowSelection({})}>
                {selectedCount} selected
              </Button>
            </div>
          ) : null}
        </>
      }
      pagination={{
        total: result.total,
        page: result.page,
        totalPages: result.totalPages,
        itemLabel: "event",
        buildHref: (page) => buildAuditLogHref(page, pageSize, activeFilters),
      }}
      pageSize={{ value: pageSize, onChange: handlePageSizeChange }}
    />
  );
}
