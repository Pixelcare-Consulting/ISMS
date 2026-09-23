"use client";

import { useMemo, useState } from "react";

import {
  TableEmptyRow,
  TableIndexCell,
  TableIndexHead,
  uniqueSearchSuggestions,
  useClientTablePagination,
} from "@/components/data-table";
import { GlobalDataTable, GlobalTableHead, useClientTableSort } from "@/lib/data-table";
import {
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/utils/cn";
import { matchesTableSearch } from "@/utils/match-table-search";

export interface PlanningTargetRow {
  id: string;
  branchId: string;
  revenueTarget: number;
  revenueLabel: string;
  branch: { name: string; sapCode: string };
}

const COL_COUNT = 4;

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

  return (
    <div id="branch-targets" className="scroll-mt-24 space-y-4">
      <GlobalDataTable
        stickyHeader
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search branch, SAP, or amount…",
          suggestions,
        }}
        // DONT UNCOMMENT toolbarLeading={<span className="text-sm font-medium">Search</span>}
        empty={targets.length === 0}
        emptyMessage="No Target Quota for this period yet. Use Import forecast with the SFE sheet — quotas are calculated from forecast qty × price list."
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
          <TableRow>
            <TableIndexHead />
            <GlobalTableHead {...sort.sortProps("sap")}>SAP Code</GlobalTableHead>
            <GlobalTableHead {...sort.sortProps("branch")}>Branch</GlobalTableHead>
            <GlobalTableHead className="text-right" {...sort.sortProps("target")}>
              Target Quota
            </GlobalTableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableEmptyRow colSpan={COL_COUNT} message="No results match your search." />
          ) : (
            pageItems.map((row, index) => (
              <TableRow
                key={row.id}
                className={cn(index % 2 === 1 && "bg-table-stripe")}
              >
                <TableIndexCell index={indexOffset + index + 1} />
                <TableCell className="font-mono text-sm">{row.branch.sapCode}</TableCell>
                <TableCell className="font-medium">{row.branch.name}</TableCell>
                <TableCell className="text-right tabular-nums">{row.revenueLabel}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </GlobalDataTable>
    </div>
  );
}
