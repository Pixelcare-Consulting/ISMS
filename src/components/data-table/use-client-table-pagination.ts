"use client";

import { useEffect, useMemo, useState } from "react";

const DEFAULT_PAGE_SIZE = 10;

/**
 * Client-side page slicing for Settings-style tables that already hold the full list.
 * Pass `resetKey` (e.g. search query) so the page resets when filters change.
 */
export function useClientTablePagination<T>(
  items: T[],
  options?: { pageSize?: number; resetKey?: string | number },
) {
  const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;
  const resetKey = options?.resetKey ?? "";
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

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
    total,
    totalPages,
    pageItems,
    /** Absolute row index for the `#` column (1-based across pages). */
    indexOffset: (safePage - 1) * pageSize,
  };
}
