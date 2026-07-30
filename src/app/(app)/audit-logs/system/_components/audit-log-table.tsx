"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { AuditActionBadge } from "@/features/audit/components/audit-action-badge";
import { AuditEntityBadge } from "@/features/audit/components/audit-entity-badge";
import {
  formatAuditActionLabel,
  formatAuditDetails,
  formatAuditEntitySummary,
  formatAuditEntityTypeLabel,
  formatAuditTimestamp,
} from "@/features/audit/constants/audit-display";
import {
  DEFAULT_TABLE_PAGE_SIZE,
  parseTablePageSize,
  type TablePageSize,
} from "@/components/data-table/table-page-size";
import { useTableSelection } from "@/components/data-table/use-table-selection";
import { TableSearchBar, uniqueSearchSuggestions } from "@/components/data-table/table-search-bar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
}

interface AuditLogFilters {
  action?: string;
  entityType?: string;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
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
}: AuditLogTableProps) {
  const router = useRouter();
  const [action, setAction] = useState(currentAction ?? "");
  const [entityType, setEntityType] = useState(currentEntityType ?? "");
  const [search, setSearch] = useState(currentSearch ?? "");
  const [dateFrom, setDateFrom] = useState(currentDateFrom ?? "");
  const [dateTo, setDateTo] = useState(currentDateTo ?? "");
  const pageSize = parseTablePageSize(result.pageSize);

  const rows = useMemo(() => result.items, [result.items]);
  const selection = useTableSelection(rows.map((row) => row.id));

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

  const hasActiveFilters = Boolean(
    currentAction ||
      currentEntityType ||
      currentSearch ||
      currentDateFrom ||
      currentDateTo,
  );

  return (
    <GlobalDataTable
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
          {selection.selectedCount > 0 ? (
            <div className="px-4 pb-2 pt-2">
              <Button variant="secondary" size="sm" onClick={selection.clearSelection}>
                {selection.selectedCount} selected
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
    >
      <TableHeader>
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <GlobalTableHead className="w-10">
            <Checkbox
              checked={selection.isAllSelected || (selection.isPartiallySelected ? "indeterminate" : false)}
              onCheckedChange={(checked) => selection.toggleAll(checked === true)}
              aria-label="Select all audit log rows"
            />
          </GlobalTableHead>
          <GlobalTableHead className="w-12">#</GlobalTableHead>
          <GlobalTableHead>Date & time</GlobalTableHead>
          <GlobalTableHead>User</GlobalTableHead>
          <GlobalTableHead>Activity</GlobalTableHead>
          <GlobalTableHead>Area</GlobalTableHead>
          <GlobalTableHead>Details</GlobalTableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => {
          const entitySummary = formatAuditEntitySummary(
            row.entityType,
            row.metadata,
          );
          const details = formatAuditDetails(row.metadata, row.action);

          return (
            <TableRow
              key={row.id}
              data-state={selection.isRowSelected(row.id) ? "selected" : undefined}
              className={cn(index % 2 === 1 && "bg-table-stripe")}
            >
              <TableCell>
                <Checkbox
                  checked={selection.isRowSelected(row.id)}
                  onCheckedChange={(checked) => selection.toggleRow(row.id, checked === true)}
                  aria-label={`Select audit row ${row.id}`}
                />
              </TableCell>
              <TableCell className="tabular-nums text-muted-foreground">
                {(result.page - 1) * result.pageSize + index + 1}
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {formatAuditTimestamp(row.createdAt)}
              </TableCell>
              <TableCell>
                <div className="font-medium">
                  {row.user
                    ? (row.user.name ?? row.user.email)
                    : "System"}
                </div>
                {row.user?.name ? (
                  <div className="text-xs text-muted-foreground">
                    {row.user.email}
                  </div>
                ) : null}
              </TableCell>
              <TableCell>
                <AuditActionBadge action={row.action} />
              </TableCell>
              <TableCell>
                <div className="flex flex-col items-start gap-1.5">
                  <AuditEntityBadge entityType={row.entityType} />
                  {entitySummary ? (
                    <span className="text-sm text-foreground">
                      {entitySummary}
                    </span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="max-w-sm text-sm text-muted-foreground">
                {details}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </GlobalDataTable>
  );
}
