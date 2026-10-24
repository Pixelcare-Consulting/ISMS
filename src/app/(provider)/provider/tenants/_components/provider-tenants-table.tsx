"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";

import { TenantStatusActions } from "@/app/(provider)/provider/tenants/_components/tenant-status-actions";
import {
  DataTable,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

const tenantColumn = createColumnHelper<DataTableFeatures, ProviderTenantRow>();

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

  const columns = useMemo(() => {
    const cols: DataTableColumn<ProviderTenantRow>[] = [
      tenantColumn.accessor("name", {
        header: "Organization",
        enableSorting: false,
        meta: { className: "font-medium" },
      }),
      tenantColumn.accessor("slug", {
        header: "Slug",
        enableSorting: false,
        meta: { className: "text-muted-foreground" },
      }),
      tenantColumn.display({
        id: "status",
        header: "Status",
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={row.original.status === "active" ? "default" : "secondary"}>
            {row.original.status === "active" ? "Active" : "Disabled"}
          </Badge>
        ),
      }),
      tenantColumn.accessor("userCount", {
        header: "Users",
        enableSorting: false,
        meta: { align: "end", className: "tabular-nums" },
      }),
      tenantColumn.display({
        id: "created",
        header: "Created",
        enableSorting: false,
        cell: ({ row }) => formatDate(row.original.createdAt),
      }),
      tenantColumn.display({
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/provider/tenants/${row.original.id}`}>View</Link>
            </Button>
            <TenantStatusActions
              tenantId={row.original.id}
              tenantName={row.original.name}
              status={row.original.status}
              compact
            />
          </div>
        ),
        meta: { align: "end" },
      }),
    ];
    return cols;
  }, []);

  return (
    <DataTable
      data={filtered}
      columns={columns}
      getRowId={(row) => row.id}
      stickyHeader
      toolbarLeading={
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
                <span className="ml-1 tabular-nums opacity-80">{statusCounts[filter.id]}</span>
              </Button>
            );
          })}
        </div>
      }
      search={{
        value: query,
        onChange: setQuery,
        placeholder: "Search tenants…",
      }}
      empty={filtered.length === 0}
      emptyMessage={
        tenants.length === 0
          ? "No customer tenants yet. Create one to get started."
          : "No tenants match your filters."
      }
    />
  );
}
