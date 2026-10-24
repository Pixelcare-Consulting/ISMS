"use client";

import { useMemo, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";

import { uniqueSearchSuggestions, useClientTablePagination } from "@/components/data-table";
import {
  DataTable,
  useClientTableSort,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
import { matchesTableSearch } from "@/utils/match-table-search";

export interface PlanningTargetRow {
  id: string;
  branchId: string;
  revenueTarget: number;
  revenueLabel: string;
  branch: { name: string; sapCode: string };
}

const targetColumn = createColumnHelper<DataTableFeatures, PlanningTargetRow>();

interface BranchRevenueTargetsTableProps {
  targets: PlanningTargetRow[];
}

export function BranchRevenueTargetsTable({ targets }: BranchRevenueTargetsTableProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () =>
      targets.filter((row) =>
        matchesTableSearch(query, [
          row.branch.name,
          row.branch.sapCode,
          row.revenueLabel,
          String(row.revenueTarget),
        ]),
      ),
    [targets, query],
  );

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        targets.map((row) => row.branch.name),
        targets.map((row) => row.branch.sapCode),
      ),
    [targets],
  );

  const sort = useClientTableSort(filtered, {
    branch: (row) => row.branch.name,
    sap: (row) => row.branch.sapCode,
    target: (row) => row.revenueTarget,
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

  const columns = useMemo(() => {
    const cols: DataTableColumn<PlanningTargetRow>[] = [
      targetColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => indexOffset + row.index + 1,
        meta: { className: "tabular-nums text-muted-foreground" },
      }),
      targetColumn.display({
        id: "sap",
        header: "SAP Code",
        enableSorting: true,
        cell: ({ row }) => row.original.branch.sapCode,
        meta: { className: "font-mono text-sm" },
      }),
      targetColumn.display({
        id: "branch",
        header: "Branch",
        enableSorting: true,
        cell: ({ row }) => row.original.branch.name,
        meta: { className: "font-medium" },
      }),
      targetColumn.display({
        id: "target",
        header: "Target Quota",
        enableSorting: true,
        cell: ({ row }) => row.original.revenueLabel,
        meta: { align: "end", className: "tabular-nums" },
      }),
    ];
    return cols;
  }, [indexOffset]);

  return (
    <div id="branch-targets" className="scroll-mt-24 space-y-4">
      <DataTable
        data={pageItems}
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
        stickyHeader
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search branch, SAP, or amount…",
          suggestions,
        }}
        // DONT UNCOMMENT toolbarLeading={<span className="text-sm font-medium">Search</span>}
        empty={pageItems.length === 0}
        emptyMessage={
          targets.length === 0
            ? "No Target Quota for this period yet. Use Import forecast with the SFE sheet — quotas are calculated from forecast qty × price list."
            : "No results match your search."
        }
        pageSize={{ value: pageSize, onChange: setPageSize }}
        pagination={{
          total,
          page,
          totalPages,
          itemLabel: "branch",
          onPageChange: setPage,
        }}
      />
    </div>
  );
}
