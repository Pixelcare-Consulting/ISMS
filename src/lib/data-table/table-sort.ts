export type TableSortDirection = "asc" | "desc";

export type TableSortComparable =
  | string
  | number
  | boolean
  | Date
  | null
  | undefined;

/**
 * Next sort state when a column header is clicked.
 * Same column toggles asc/desc; a new column starts at desc.
 */
export function nextTableSort(
  clickedKey: string,
  activeKey: string,
  activeDir: TableSortDirection,
): { sort: string; dir: TableSortDirection } {
  if (activeKey === clickedKey) {
    return {
      sort: clickedKey,
      dir: activeDir === "asc" ? "desc" : "asc",
    };
  }
  return { sort: clickedKey, dir: "desc" };
}

/** Compare two cell values for table sorting. Nullish values always sort last. */
export function compareTableValues(
  a: TableSortComparable,
  b: TableSortComparable,
  dir: TableSortDirection,
): number {
  const mul = dir === "asc" ? 1 : -1;
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  if (typeof a === "number" && typeof b === "number") {
    return (a - b) * mul;
  }
  if (typeof a === "boolean" && typeof b === "boolean") {
    return (Number(a) - Number(b)) * mul;
  }
  if (a instanceof Date && b instanceof Date) {
    return (a.getTime() - b.getTime()) * mul;
  }

  const as = a instanceof Date ? a.toISOString() : String(a);
  const bs = b instanceof Date ? b.toISOString() : String(b);
  return (
    as.localeCompare(bs, undefined, { numeric: true, sensitivity: "base" }) * mul
  );
}

/** Sort a full in-memory row list by a column accessor map. */
export function sortTableRows<T>(
  rows: T[],
  sortKey: string,
  sortDir: TableSortDirection,
  accessors: Record<string, (row: T) => TableSortComparable>,
): T[] {
  const getValue = accessors[sortKey];
  if (!getValue || !sortKey) return rows;

  return [...rows].sort((a, b) =>
    compareTableValues(getValue(a), getValue(b), sortDir),
  );
}
