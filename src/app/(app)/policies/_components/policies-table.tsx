"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  DataTableEmpty,
  DataTableScroll,
  DataTableShell,
} from "@/components/data-table/data-table-shell";
import { useTableSelection } from "@/components/data-table/use-table-selection";
import { TableSearchToolbar } from "@/components/data-table/table-search-bar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PolicyStatus } from "@/features/policies/constants/policy-status";
import { matchesTableSearch } from "@/utils/match-table-search";
import { cn } from "@/utils/cn";

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
  const selection = useTableSelection(filtered.map((policy) => policy.id));

  const emptyMessage = viewOnly
    ? "No approved policies are available yet."
    : "No policies yet. Create your first policy document.";

  if (policies.length === 0) {
    return (
      <DataTableShell>
        <TableSearchToolbar
          value={query}
          onChange={setQuery}
          placeholder="Search policies…"
        />
        <DataTableEmpty message={emptyMessage} />
      </DataTableShell>
    );
  }

  return (
    <DataTableShell>
      <TableSearchToolbar
        value={query}
        onChange={setQuery}
        placeholder="Search policies…"
      >
        {selection.selectedCount > 0 ? (
          <Badge variant="secondary">{selection.selectedCount} selected</Badge>
        ) : null}
      </TableSearchToolbar>
      {filtered.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          No policies match your search.
        </div>
      ) : (
        <DataTableScroll>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="w-10">
                  <Checkbox
                    checked={selection.isAllSelected || (selection.isPartiallySelected ? "indeterminate" : false)}
                    onCheckedChange={(checked) => selection.toggleAll(checked === true)}
                    aria-label="Select all policies"
                  />
                </TableHead>
                <TableHead className="w-12 text-center text-muted-foreground">
                  #
                </TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((policy, index) => (
                <TableRow
                  key={policy.id}
                  data-state={selection.isRowSelected(policy.id) ? "selected" : undefined}
                  className={cn(index % 2 === 1 && "bg-table-stripe")}
                >
                  <TableCell>
                    <Checkbox
                      checked={selection.isRowSelected(policy.id)}
                      onCheckedChange={(checked) => selection.toggleRow(policy.id, checked === true)}
                      aria-label={`Select policy ${policy.title}`}
                    />
                  </TableCell>
                  <TableCell className="text-center tabular-nums text-muted-foreground">
                    {index + 1}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/policies/${policy.id}`}
                      className="font-medium hover:underline"
                    >
                      {policy.title}
                    </Link>
                    {policy.description ? (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {policy.description}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(policy.status)}>
                      {policy.statusLabel}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {policy.createdByName}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {new Date(policy.updatedAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataTableScroll>
      )}
    </DataTableShell>
  );
}
