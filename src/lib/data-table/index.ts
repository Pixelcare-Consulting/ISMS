/**
 * Global data table — single reusable table UI for the whole app.
 * Track down: search "GlobalDataTable" or import from `@/lib/data-table`.
 */
export { DataTable } from "@/lib/data-table/data-table";
export type { DataTableColumn, DataTableProps } from "@/lib/data-table/data-table";
export {
  dataTableFeatures,
  type DataTableFeatures,
} from "@/lib/data-table/data-table-features";
export type {
  DataTableAlign,
  DataTableColumnMeta,
  DataTableMobile,
} from "@/lib/data-table/data-table-column-meta";
export { selectDataTableRows } from "@/lib/data-table/select-data-table-rows";
export type { SelectDataTableRowsInput } from "@/lib/data-table/select-data-table-rows";
export { GlobalDataTable } from "@/lib/data-table/global-data-table";
export { GlobalTableHead } from "@/lib/data-table/global-table-head";
export { useGlobalTableStickyHeader } from "@/lib/data-table/sticky-context";
export {
  compareTableValues,
  nextTableSort,
  sortTableRows,
} from "@/lib/data-table/table-sort";
export type {
  TableSortComparable,
  TableSortDirection,
} from "@/lib/data-table/table-sort";
export { useClientTableSort } from "@/lib/data-table/use-client-table-sort";
export type {
  GlobalDataTablePageSize,
  GlobalDataTablePagination,
  GlobalDataTableSearch,
  PaginatedTableResult,
} from "@/lib/data-table/types";
export type { GlobalDataTableProps } from "@/lib/data-table/global-data-table";
