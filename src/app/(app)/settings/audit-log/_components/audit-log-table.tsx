"use client";

import Link from "next/link";
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
  DataTableEmpty,
  DataTableScroll,
  DataTableShell,
} from "@/components/data-table/data-table-shell";
import { TableSearchBar } from "@/components/data-table/table-search-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

function buildAuditLogHref(page: number, filters: AuditLogFilters = {}): string {
  const params = new URLSearchParams();

  if (page > 1) {
    params.set("page", String(page));
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
  return query ? `/settings/audit-log?${query}` : "/settings/audit-log";
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

  const rows = useMemo(() => result.items, [result.items]);
  const activeFilters: AuditLogFilters = {
    action: currentAction,
    entityType: currentEntityType,
    q: currentSearch,
    dateFrom: currentDateFrom,
    dateTo: currentDateTo,
  };

  function applyFilters() {
    router.push(
      buildAuditLogHref(1, {
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
    router.push("/settings/audit-log");
  }

  const hasActiveFilters = Boolean(
    currentAction ||
      currentEntityType ||
      currentSearch ||
      currentDateFrom ||
      currentDateTo,
  );

  return (
    <DataTableShell>
      <div className="space-y-4 border-b px-4 py-4">
        <TableSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search by user, activity, or area…"
        />

        <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end lg:gap-3">
          <div className="grid shrink-0 gap-3 sm:grid-cols-2 lg:max-w-md">
            <div className="space-y-2">
              <Label htmlFor="audit-action-filter">Activity</Label>
              <Select
                value={action || "all"}
                onValueChange={(value) =>
                  setAction(value === "all" ? "" : value)
                }
              >
                <SelectTrigger id="audit-action-filter">
                  <SelectValue placeholder="All activities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All activities</SelectItem>
                  {filterOptions.actions.map((item) => (
                    <SelectItem key={item} value={item}>
                      {formatAuditActionLabel(item)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="audit-entity-filter">Area</Label>
              <Select
                value={entityType || "all"}
                onValueChange={(value) =>
                  setEntityType(value === "all" ? "" : value)
                }
              >
                <SelectTrigger id="audit-entity-filter">
                  <SelectValue placeholder="All areas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All areas</SelectItem>
                  {filterOptions.entityTypes.map((item) => (
                    <SelectItem key={item} value={item}>
                      {formatAuditEntityTypeLabel(item)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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

      {rows.length === 0 ? (
        <DataTableEmpty
          message={
            hasActiveFilters
              ? "No activity matches your filters."
              : "No activity has been recorded yet."
          }
        />
      ) : (
        <>
          <DataTableScroll>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead>Date & time</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Activity</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>Details</TableHead>
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
                      className={cn(index % 2 === 1 && "bg-table-stripe")}
                    >
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
            </Table>
          </DataTableScroll>
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
            <span>
              {result.total} event{result.total === 1 ? "" : "s"} · page{" "}
              {result.page} of {result.totalPages}
            </span>
            <div className="flex gap-2">
              {result.page > 1 ? (
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={buildAuditLogHref(result.page - 1, activeFilters)}
                  >
                    Previous
                  </Link>
                </Button>
              ) : null}
              {result.page < result.totalPages ? (
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={buildAuditLogHref(result.page + 1, activeFilters)}
                  >
                    Next
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        </>
      )}
    </DataTableShell>
  );
}
