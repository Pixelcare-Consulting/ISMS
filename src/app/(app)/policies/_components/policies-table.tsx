"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { createColumnHelper, type RowSelectionState } from "@tanstack/react-table";

import { uniqueSearchSuggestions } from "@/components/data-table/table-search-bar";
import {
  DataTable,
  useClientTableSort,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
import { Badge } from "@/components/ui/badge";
import type { PolicyStatus } from "@/features/policies/constants/policy-status";
import { matchesTableSearch } from "@/utils/match-table-search";

const policyColumn = createColumnHelper<DataTableFeatures, PolicyRow>();

interface PolicyRow {
  id: string;
  title: string;
  description: string | null;
  status: PolicyStatus;
  statusLabel: string;
  updatedAt: Date;
  createdByName: string;
}

interface PoliciesTableProps {
  policies: PolicyRow[];
  viewOnly?: boolean;
  canCreate: boolean;
  canApprove: boolean;
}

function statusVariant(status: PolicyStatus): "default" | "secondary" | "outline" {
  if (status === "approved") return "default";
  if (status === "review") return "secondary";
  return "outline";
}

export function PoliciesTable({
  policies,
  viewOnly = false,
}: PoliciesTableProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () =>
      policies.filter((policy) =>
        matchesTableSearch(query, [
          policy.title,
          policy.description,
          policy.statusLabel,
          policy.createdByName,
        ]),
      ),
    [policies, query],
  );

  const sort = useClientTableSort(filtered, {
    title: (policy) => policy.title,
    status: (policy) => policy.statusLabel,
    owner: (policy) => policy.createdByName,
    updated: (policy) => policy.updatedAt,
  });

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        policies.map((policy) => policy.title),
        policies.map((policy) => policy.description),
        policies.map((policy) => policy.statusLabel),
        policies.map((policy) => policy.createdByName),
      ),
    [policies],
  );

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const selectedCount = filtered.filter((policy) => rowSelection[policy.id]).length;

  const emptyMessage = viewOnly
    ? "No approved policies are available yet."
    : "No policies yet. Create your first policy document.";

  const columns = useMemo(() => {
    const cols: DataTableColumn<PolicyRow>[] = [
      policyColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => row.index + 1,
        meta: { className: "text-center tabular-nums text-muted-foreground" },
      }),
      policyColumn.display({
        id: "title",
        header: "Title",
        enableSorting: true,
        cell: ({ row }) => (
          <div>
            <Link href={`/policies/${row.original.id}`} className="font-medium hover:underline">
              {row.original.title}
            </Link>
            {row.original.description ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {row.original.description}
              </p>
            ) : null}
          </div>
        ),
      }),
      policyColumn.display({
        id: "status",
        header: "Status",
        enableSorting: true,
        cell: ({ row }) => (
          <Badge variant={statusVariant(row.original.status)}>{row.original.statusLabel}</Badge>
        ),
      }),
      policyColumn.display({
        id: "owner",
        header: "Owner",
        enableSorting: true,
        cell: ({ row }) => row.original.createdByName,
        meta: { className: "text-muted-foreground" },
      }),
      policyColumn.display({
        id: "updated",
        header: "Updated",
        enableSorting: true,
        cell: ({ row }) => new Date(row.original.updatedAt).toLocaleDateString(),
        meta: { className: "text-muted-foreground" },
      }),
    ];
    return cols;
  }, []);

  return (
    <DataTable
      data={sort.sorted}
      columns={columns}
      getRowId={(row) => row.id}
      manualSorting
      manualPagination
      enableSorting
      sorting={{
        sortKey: sort.sortKey,
        sortDir: sort.sortDir,
        onSort: sort.toggleSort,
      }}
      enableRowSelection
      rowSelection={rowSelection}
      onRowSelectionChange={setRowSelection}
      selectAllLabel="Select all policies"
      getSelectionLabel={(row) => `Select policy ${row.title}`}
      stickyHeader
      search={{
        value: query,
        onChange: setQuery,
        placeholder: "Search policies…",
        suggestions,
      }}
      toolbarActions={
        selectedCount > 0 ? (
          <Badge variant="secondary">{selectedCount} selected</Badge>
        ) : null
      }
      empty={sort.sorted.length === 0}
      emptyMessage={policies.length === 0 ? emptyMessage : "No policies match your search."}
    />
  );
}
