import {
  columnVisibilityFeature,
  metaHelper,
  rowExpandingFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
} from "@tanstack/react-table";

import type { DataTableColumnMeta } from "@/lib/data-table/data-table-column-meta";

/**
 * Column engine for DataTable. Sorting and pagination row models are omitted
 * on purpose: callers pass an already ordered page, and manual mode must not
 * sort or slice it again.
 */
export const dataTableFeatures = tableFeatures({
  columnVisibilityFeature,
  rowExpandingFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  columnMeta: metaHelper<DataTableColumnMeta>(),
});

export type DataTableFeatures = typeof dataTableFeatures;
