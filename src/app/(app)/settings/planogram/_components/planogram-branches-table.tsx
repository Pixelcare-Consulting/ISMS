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
  uniqueSearchSuggestions,
  useClientTablePagination,
} from "@/components/data-table";
import { GlobalDataTable, GlobalTableHead, useClientTableSort } from "@/lib/data-table";
import { Button } from "@/components/ui/button";
import {
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  buildBranchPlanogramHref,
  matchesPlanogramIndexView,
  type PlanogramIndexBranch,
  type PlanogramIndexView,
} from "@/features/planogram/lib/planogram-index";
import { matchesTableSearch } from "@/utils/match-table-search";
import { cn } from "@/utils/cn";

interface PlanogramBranchesTableProps {
  branches: PlanogramIndexBranch[];
  view: PlanogramIndexView | null;
  query: string;
  onQueryChange: (query: string) => void;
  canManage?: boolean;
}

const COL_COUNT = 7;

function emptyMessage(view: PlanogramIndexView | null): string {
  if (view == null) return "No branches match your search.";
  if (view === "empty") {
    return "No branches match this filter. Open a branch to add SKUs (Allowed models first) or Import the Planogram template.";
  }
  return "No branches match this filter.";
}

export function PlanogramBranchesTable({
  branches,
  view,
  query,
  onQueryChange,
  canManage = false,
}: PlanogramBranchesTableProps) {
  const [importing, setImporting] = useState(false);

  const viewFiltered = useMemo(
    () => branches.filter((branch) => matchesPlanogramIndexView(branch, view)),
    [branches, view],
  );

  const filtered = useMemo(
    () =>
      viewFiltered.filter((branch) =>
        matchesTableSearch(query, [branch.name, branch.sapCode]),
      ),
    [viewFiltered, query],
  );

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        viewFiltered.map((branch) => branch.name),
        viewFiltered.map((branch) => branch.sapCode),
      ),
    [viewFiltered],
  );

  const sort = useClientTableSort(filtered, {
    name: (branch) => branch.name,
    sapCode: (branch) => branch.sapCode,
    skuCount: (branch) => branch.skuCount,
    belowCapacityCount: (branch) => branch.belowCapacityCount,
    milCount: (branch) => branch.milCount,
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
    resetKey: `${view ?? "all"}:${query}:${sort.sortKey}:${sort.sortDir}`,
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
          onChange: onQueryChange,
          placeholder: "Search by branch name or SAP code…",
          suggestions,
        }}
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
          itemLabel: "branches",
          onPageChange: setPage,
        }}
      >
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableIndexHead />
              <GlobalTableHead {...sort.sortProps("sapCode")}>SAP code</GlobalTableHead>
              <GlobalTableHead {...sort.sortProps("name")}>Branch</GlobalTableHead>
              <GlobalTableHead className="text-right" {...sort.sortProps("skuCount")}>
                SKUs
              </GlobalTableHead>
              <GlobalTableHead
                className="text-right"
                {...sort.sortProps("belowCapacityCount")}
              >
                Below max
              </GlobalTableHead>
              <GlobalTableHead className="text-right" {...sort.sortProps("milCount")}>
                MIL
              </GlobalTableHead>
              <GlobalTableHead className="text-right"> </GlobalTableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableEmptyRow colSpan={COL_COUNT} message={emptyMessage(view)} />
            ) : (
              pageItems.map((branch, index) => (
                <TableRow
                  key={branch.id}
                  className={cn(index % 2 === 1 && "bg-table-stripe")}
                >
                  <TableIndexCell index={indexOffset + index + 1} />
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {branch.sapCode}
                  </TableCell>
                  <TableCell className="font-medium">{branch.name}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {branch.skuCount}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      branch.belowCapacityCount === 0 && "text-muted-foreground",
                    )}
                  >
                    {branch.belowCapacityCount}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      branch.milCount > 0
                        ? "font-medium text-amber-600 dark:text-amber-400"
                        : "text-muted-foreground",
                    )}
                  >
                    {branch.milCount}
                  </TableCell>
                  <TableRowActions>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={buildBranchPlanogramHref(branch.id, { view, q: query })}>
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
