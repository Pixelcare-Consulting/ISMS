"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight, Upload } from "lucide-react";

import { ImportPlanogramDialog } from "@/app/(app)/settings/planogram/_components/import-planogram-dialog";
import {
  DataTableEmptyState,
  TableEmptyRow,
  TableIndexCell,
  TableIndexHead,
  TableRowActions,
  TableRowCheckbox,
  TableSelectAllCheckbox,
  TableSelectionBadge,
  uniqueSearchSuggestions,
  useClientTablePagination,
  useTableSelection,
} from "@/components/data-table";
import { GlobalDataTable, GlobalTableHead, useClientTableSort } from "@/lib/data-table";
import { Button } from "@/components/ui/button";
import {
  TableBody,
  TableCell,
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
  canManage?: boolean;
}

const COL_COUNT = 5;

export function PlanogramBranchesTable({
  branches,
  canManage = false,
}: PlanogramBranchesTableProps) {
  const [query, setQuery] = useState("");
  const [importing, setImporting] = useState(false);

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
  const sort = useClientTableSort(filtered, {
    name: (branch) => branch.name,
    sapCode: (branch) => branch.sapCode,
  });
  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    total,
    totalPages,
    pageItems,
    indexOffset,
  } = useClientTablePagination(sort.sorted, {
    resetKey: `${query}:${sort.sortKey}:${sort.sortDir}`,
  });

  if (branches.length === 0) {
    return (
      <div className="space-y-4">
        {canManage ? (
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setImporting(true)}>
              <Upload className="mr-1 size-4" />
              Import
            </Button>
          </div>
        ) : null}
        <DataTableEmptyState message="No branches available for your account." />
        {canManage ? (
          <ImportPlanogramDialog open={importing} onOpenChange={setImporting} />
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Branches</h2>
      <GlobalDataTable
        stickyHeader
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search by branch name or SAP code…",
          suggestions,
        }}
        toolbarLeading={
          <TableSelectionBadge
            count={selection.selectedCount}
            onClear={selection.clearSelection}
            size="sm"
          />
        }
        toolbarActions={
          canManage ? (
            <Button variant="outline" size="sm" onClick={() => setImporting(true)}>
              <Upload className="mr-1 size-4" />
              Import
            </Button>
          ) : undefined
        }
        pageSize={{ value: pageSize, onChange: setPageSize }}
        pagination={{
          total,
          page,
          totalPages,
          itemLabel: "branch",
          onPageChange: setPage,
        }}
      >
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableSelectAllCheckbox
                isAllSelected={selection.isAllSelected}
                isPartiallySelected={selection.isPartiallySelected}
                onToggleAll={selection.toggleAll}
                aria-label="Select all branches"
              />
              <TableIndexHead />
              <GlobalTableHead className="w-[45%]" {...sort.sortProps("name")}>
                Branch
              </GlobalTableHead>
              <GlobalTableHead className="w-[35%]" {...sort.sortProps("sapCode")}>
                SAP code
              </GlobalTableHead>
              <GlobalTableHead className="w-[20%] text-right"> </GlobalTableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableEmptyRow
                colSpan={COL_COUNT}
                message="No branches match your search."
              />
            ) : (
              pageItems.map((branch, index) => (
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
                  <TableIndexCell index={indexOffset + index + 1} />
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
      </GlobalDataTable>
      {canManage ? (
        <ImportPlanogramDialog open={importing} onOpenChange={setImporting} />
      ) : null}
    </div>
  );
}
