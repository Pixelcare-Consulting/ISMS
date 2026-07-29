import type { TablePageSize } from "@/components/data-table/table-page-size";

/** Standard paginated list shape from server actions / repositories. */
export interface PaginatedTableResult {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface GlobalDataTablePagination {
  total: number;
  page: number;
  totalPages: number;
  itemLabel: string;
  /** Server/URL pagination (Orders, Inventory, Audit). */
  buildHref?: (page: number) => string;
  /** Client pagination (Settings tables with in-memory lists). */
  onPageChange?: (page: number) => void;
}

export interface GlobalDataTableSearch {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  suggestions?: string[];
}

export interface GlobalDataTablePageSize {
  value: number;
  onChange: (limit: TablePageSize) => void;
}
