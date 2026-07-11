"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";

import {
  AppDataTable,
  AppDataTableBody,
  DataTableEmptyState,
  TableEmptyRow,
  TableIndexCell,
  TableIndexHead,
  TableRowActions,
  TableRowCheckbox,
  TableSearchBar,
  TableSelectAllCheckbox,
  TableSelectionBadge,
  uniqueSearchSuggestions,
  useTableSelection,
} from "@/components/data-table";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { matchesTableSearch } from "@/utils/match-table-search";
import { cn } from "@/utils/cn";

export interface PlanogramBranchRow {
  id: string;
  name: string;
  sapCode: string;
}

interface PlanogramBranchesTableProps {
  branches: PlanogramBranchRow[];
}

const COL_COUNT = 5;

export function PlanogramBranchesTable({ branches }: PlanogramBranchesTableProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () =>
      branches.filter((branch) =>
        matchesTableSearch(query, [branch.name, branch.sapCode]),
      ),
    [branches, query],
  );

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        branches.map((branch) => branch.name),
        branches.map((branch) => branch.sapCode),
      ),
    [branches],
  );

  const selection = useTableSelection(filtered.map((branch) => branch.id));

  if (branches.length === 0) {
    return <DataTableEmptyState message="No branches available for your account." />;
  }

  return (
    <AppDataTable
      title="Branches"
      shellHeader={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TableSearchBar
            value={query}
            onChange={setQuery}
            placeholder="Search by branch name or SAP code…"
            suggestions={suggestions}
            className="sm:max-w-sm"
          />
          <TableSelectionBadge
            count={selection.selectedCount}
            onClear={selection.clearSelection}
            size="sm"
          />
        </div>
      }
    >
      <AppDataTableBody>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableSelectAllCheckbox
                isAllSelected={selection.isAllSelected}
                isPartiallySelected={selection.isPartiallySelected}
                onToggleAll={selection.toggleAll}
                aria-label="Select all branches"
              />
              <TableIndexHead />
              <TableHead className="w-[45%]">Branch</TableHead>
              <TableHead className="w-[35%]">SAP code</TableHead>
              <TableHead className="w-[20%] text-right"> </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableEmptyRow
                colSpan={COL_COUNT}
                message="No branches match your search."
              />
            ) : (
              filtered.map((branch, index) => (
                <TableRow
                  key={branch.id}
                  data-state={selection.isRowSelected(branch.id) ? "selected" : undefined}
                  className={cn(index % 2 === 1 && "bg-table-stripe")}
                >
                  <TableRowCheckbox
                    checked={selection.isRowSelected(branch.id)}
                    onCheckedChange={(checked) => selection.toggleRow(branch.id, checked)}
                    aria-label={`Select branch ${branch.name}`}
                  />
                  <TableIndexCell index={index + 1} />
                  <TableCell className="font-medium">{branch.name}</TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {branch.sapCode}
                  </TableCell>
                  <TableRowActions>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/settings/branches/${branch.id}/planogram`}>
                        Open
                        <ChevronRight className="size-4" />
                      </Link>
                    </Button>
                  </TableRowActions>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </AppDataTableBody>
    </AppDataTable>
  );
}
