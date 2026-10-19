export interface SelectDataTableRowsInput<T> {
  /** The array the caller handed the table, already a server page when manual. */
  data: readonly T[];
  /** Rows after `useClientTableSort`. Ignored while sorting is manual. */
  clientSorted: readonly T[];
  /** Page slice after `useClientTablePagination`. Ignored while paging is manual. */
  clientPage: readonly T[];
  manualSorting: boolean;
  manualPagination: boolean;
  sortingEnabled: boolean;
  paginationEnabled: boolean;
}

/**
 * Choose which array the table renders.
 * Manual sorting and manual pagination together return `data` unchanged —
 * same order, same length, same reference — so a server page is never
 * sorted or sliced again.
 */
export function selectDataTableRows<T>(
  input: SelectDataTableRowsInput<T>,
): readonly T[] {
  if (input.manualSorting && input.manualPagination) {
    return input.data;
  }

  const sorted =
    input.sortingEnabled && !input.manualSorting
      ? input.clientSorted
      : input.data;

  if (input.paginationEnabled && !input.manualPagination) {
    return input.clientPage;
  }

  return sorted;
}
