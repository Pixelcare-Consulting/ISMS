"use client";

import { useMemo, useState } from "react";

import {
  DEFAULT_TABLE_PAGE_SIZE,
  parseTablePageSize,
  type TablePageSize,
} from "@/components/data-table/table-page-size";

/**
 * Client-side page slicing for Settings-style tables that already hold the full list.
 * Pass `resetKey` (e.g. search query) so the page resets when filters change.
 */
export function useClientTablePagination<T>(
  items: T[],
  options?: { pageSize?: number; resetKey?: string | number },
) {
  const [pageSize, setPageSizeState] = useState<TablePageSize>(() =>
    parseTablePageSize(options?.pageSize ?? DEFAULT_TABLE_PAGE_SIZE),
  );
  const resetKey = options?.resetKey ?? "";
  const [page, setPage] = useState(1);

  /**
   * Go back to the first page whenever the filter or page size changes — page 4 of the
   * old list means nothing in the new one. Adjusted during render rather than in an
   * effect, which would render one frame of the wrong slice before correcting itself.
   */
  const pageResetSeed = `${resetKey}:${pageSize}`;
  const [seededReset, setSeededReset] = useState(pageResetSeed);
  if (seededReset !== pageResetSeed) {
    setSeededReset(pageResetSeed);
    setPage(1);
  }

  function setPageSize(next: TablePageSize) {
    setPageSizeState(parseTablePageSize(next));
  }

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);

  const pageItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, pageSize, safePage]);

  return {
    page: safePage,
    setPage,
    pageSize,
    setPageSize,
    total,
    totalPages,
    pageItems,
    /** Absolute row index for the `#` column (1-based across pages). */
    indexOffset: (safePage - 1) * pageSize,
  };
}
