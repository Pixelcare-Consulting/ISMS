"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { TenantStatusActions } from "@/app/(provider)/provider/tenants/_components/tenant-status-actions";
import {
  DataTableScroll,
  DataTableShell,
  TableEmptyRow,
} from "@/components/data-table/data-table-shell";
import { TableSearchToolbar } from "@/components/data-table/table-search-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/utils/cn";
import { matchesTableSearch } from "@/utils/match-table-search";

export type ProviderTenantRow = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "disabled";
  userCount: number;
  createdAt: string;
};

type StatusFilter = "all" | "active" | "disabled";

interface ProviderTenantsTableProps {
  tenants: ProviderTenantRow[];
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const STATUS_FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "disabled", label: "Disabled" },
];

export function ProviderTenantsTable({ tenants }: ProviderTenantsTableProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const statusCounts = useMemo(() => {
    let active = 0;
    let disabled = 0;
    for (const tenant of tenants) {
      if (tenant.status === "active") active += 1;
      else disabled += 1;
    }
    return { all: tenants.length, active, disabled };
  }, [tenants]);

  const filtered = useMemo(
    () =>
      tenants.filter((tenant) => {
        if (statusFilter !== "all" && tenant.status !== statusFilter) {
          return false;
        }
        return matchesTableSearch(query, [
          tenant.name,
          tenant.slug,
          tenant.status,
        ]);
      }),
    [tenants, query, statusFilter],
  );

  return (
    <DataTableShell>
      <div className="flex flex-col gap-3 border-b border-border/70 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((filter) => {
            const selected = statusFilter === filter.id;
            return (
              <Button
                key={filter.id}
                type="button"
                size="sm"
                variant={selected ? "default" : "outline"}
                className={cn(!selected && "text-muted-foreground")}
                onClick={() => setStatusFilter(filter.id)}
              >
                {filter.label}
                <span className="ml-1 tabular-nums opacity-80">
                  {statusCounts[filter.id]}
                </span>
              </Button>
            );
          })}
        </div>
        <TableSearchToolbar
          value={query}
          onChange={setQuery}
          placeholder="Search tenants…"
          className="border-0 p-0 sm:max-w-xs"
        />
      </div>
      <DataTableScroll>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Organization</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Users</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableEmptyRow
                colSpan={6}
                message={
                  tenants.length === 0
                    ? "No customer tenants yet. Create one to get started."
                    : "No tenants match your filters."
                }
              />
            ) : (
              filtered.map((tenant) => (
                <TableRow key={tenant.id}>
                  <TableCell className="font-medium">{tenant.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {tenant.slug}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        tenant.status === "active" ? "default" : "secondary"
                      }
                    >
                      {tenant.status === "active" ? "Active" : "Disabled"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {tenant.userCount}
                  </TableCell>
                  <TableCell>{formatDate(tenant.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/provider/tenants/${tenant.id}`}>
                          View
                        </Link>
                      </Button>
                      <TenantStatusActions
                        tenantId={tenant.id}
                        tenantName={tenant.name}
                        status={tenant.status}
                        compact
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </DataTableScroll>
    </DataTableShell>
  );
}
