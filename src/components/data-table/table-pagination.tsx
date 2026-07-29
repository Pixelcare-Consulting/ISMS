import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

/** How many page number buttons to show around the current page. */
const PAGE_WINDOW_SIZE = 6;

interface TablePaginationMeta {
  total: number;
  page: number;
  totalPages: number;
  itemLabel?: string;
}

interface TablePaginationProps {
  /** URL-based pagination (Orders, Inventory, Audit). */
  buildHref?: (page: number) => string;
  /** Client-side pagination (Settings tables that filter in-browser). */
  onPageChange?: (page: number) => void;
  meta?: TablePaginationMeta;
  total?: number;
  page?: number;
  totalPages?: number;
  label?: string;
}

/**
 * Sliding page-number window for table footers.
 * Example on page 10 of many: First Previous 9 10 11 12 13 14 Next Last
 */
export function getVisiblePageNumbers(
  currentPage: number,
  totalPages: number,
  windowSize: number = PAGE_WINDOW_SIZE,
): number[] {
  if (totalPages < 1) return [];
  if (totalPages <= windowSize) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  let start = Math.max(1, currentPage - 1);
  let end = start + windowSize - 1;
  if (end > totalPages) {
    end = totalPages;
    start = Math.max(1, end - windowSize + 1);
  }

  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

function PaginationControl({
  page,
  isCurrent = false,
  buildHref,
  onPageChange,
  children,
}: {
  page: number;
  isCurrent?: boolean;
  buildHref?: (page: number) => string;
  onPageChange?: (page: number) => void;
  children: ReactNode;
}) {
  if (isCurrent) {
    return (
      <Button
        variant="default"
        size="sm"
        className="min-w-8 px-2.5"
        aria-current="page"
      >
        {children}
      </Button>
    );
  }

  if (onPageChange) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="min-w-8 px-2.5"
        type="button"
        onClick={() => onPageChange(page)}
      >
        {children}
      </Button>
    );
  }

  if (!buildHref) {
    return null;
  }

  return (
    <Button variant="outline" size="sm" className="min-w-8 px-2.5" asChild>
      <Link href={buildHref(page)}>{children}</Link>
    </Button>
  );
}

/**
 * Shared table pagination: First · Previous · page numbers · Next · Last.
 * Used by Orders, Inventory, Logistics, Settings, Reports, etc.
 * First is hidden on page 1; Last is hidden on the last page.
 */
export function TablePagination({
  buildHref,
  onPageChange,
  meta,
  total,
  page,
  totalPages,
  label = "item",
}: TablePaginationProps) {
  const resolvedTotal = meta?.total ?? total ?? 0;
  const resolvedPage = meta?.page ?? page ?? 1;
  const resolvedTotalPages = meta?.totalPages ?? totalPages ?? 1;
  const resolvedLabel = meta?.itemLabel ?? label;
  const pluralLabel =
    resolvedTotal === 1
      ? resolvedLabel
      : resolvedLabel.endsWith("s")
        ? resolvedLabel
        : `${resolvedLabel}s`;
  const visiblePages = getVisiblePageNumbers(resolvedPage, resolvedTotalPages);
  const showFirst = resolvedPage > 1;
  const showPrevious = resolvedPage > 1;
  const showNext = resolvedPage < resolvedTotalPages;
  const showLast = resolvedPage < resolvedTotalPages;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-sm text-muted-foreground">
      <span>
        {resolvedTotal} {pluralLabel} · page {resolvedPage} of {resolvedTotalPages}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {showFirst ? (
          <PaginationControl page={1} buildHref={buildHref} onPageChange={onPageChange}>
            First
          </PaginationControl>
        ) : null}
        {showPrevious ? (
          <PaginationControl
            page={resolvedPage - 1}
            buildHref={buildHref}
            onPageChange={onPageChange}
          >
            Previous
          </PaginationControl>
        ) : null}

        {visiblePages.map((pageNumber) => (
          <PaginationControl
            key={pageNumber}
            page={pageNumber}
            isCurrent={pageNumber === resolvedPage}
            buildHref={buildHref}
            onPageChange={onPageChange}
          >
            {pageNumber}
          </PaginationControl>
        ))}

        {showNext ? (
          <PaginationControl
            page={resolvedPage + 1}
            buildHref={buildHref}
            onPageChange={onPageChange}
          >
            Next
          </PaginationControl>
        ) : null}
        {showLast ? (
          <PaginationControl
            page={resolvedTotalPages}
            buildHref={buildHref}
            onPageChange={onPageChange}
          >
            Last
          </PaginationControl>
        ) : null}
        {showLast ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={buildHref(resolvedTotalPages)}>Last</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
