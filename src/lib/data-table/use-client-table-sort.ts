"use client";

import { useMemo, useState } from "react";

import {
  nextTableSort,
  sortTableRows,
  type TableSortComparable,
  type TableSortDirection,
} from "@/lib/data-table/table-sort";

/**
 * Client-side Asc/Desc for tables that already hold the full filtered list.
 * Pass sorted rows into `useClientTablePagination` (sort before page slice).
 */
export function useClientTableSort<T>(
  rows: T[],
  accessors: Record<string, (row: T) => TableSortComparable>,
  options?: { initialKey?: string; initialDir?: TableSortDirection },
) {
  const [sortKey, setSortKey] = useState(options?.initialKey ?? "");
  const [sortDir, setSortDir] = useState<TableSortDirection>(
    options?.initialDir ?? "desc",
  );

  const sorted = useMemo(
    () => (sortKey ? sortTableRows(rows, sortKey, sortDir, accessors) : rows),
    [rows, sortKey, sortDir, accessors],
  );

  function toggleSort(key: string) {
    const next = nextTableSort(key, sortKey, sortDir);
    setSortKey(next.sort);
    setSortDir(next.dir);
  }

  return {
    sortKey,
    sortDir,
    sorted,
    toggleSort,
    /** Props to spread onto each sortable GlobalTableHead. */
    sortProps: (key: string) => ({
      sortKey: key,
      activeSortKey: sortKey,
      sortDirection: sortDir,
      onSort: toggleSort,
    }),
  };
}
