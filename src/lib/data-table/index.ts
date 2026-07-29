/**
 * Global data table — single reusable table UI for the whole app.
 * Track down: search "GlobalDataTable" or import from `@/lib/data-table`.
 */
export { GlobalDataTable } from "@/lib/data-table/global-data-table";
export { GlobalTableHead } from "@/lib/data-table/global-table-head";
export { useGlobalTableStickyHeader } from "@/lib/data-table/sticky-context";
export type {
  GlobalDataTablePageSize,
  GlobalDataTablePagination,
  GlobalDataTableSearch,
  PaginatedTableResult,
} from "@/lib/data-table/types";
export type { GlobalDataTableProps } from "@/lib/data-table/global-data-table";
