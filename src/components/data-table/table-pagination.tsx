import Link from "next/link";

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
  buildHref: (page: number) => string;
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

/**
 * Shared table pagination: First · Previous · page numbers · Next · Last.
 * Used by Orders, Inventory, Logistics, Reports, etc.
 * First is hidden on page 1; Last is hidden on the last page.
 */
export function TablePagination({
  buildHref,
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
  const visiblePages = getVisiblePageNumbers(resolvedPage, resolvedTotalPages);
  const showFirst = resolvedPage > 1;
  const showPrevious = resolvedPage > 1;
  const showNext = resolvedPage < resolvedTotalPages;
  const showLast = resolvedPage < resolvedTotalPages;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-sm text-muted-foreground">
      <span>
        {resolvedTotal} {resolvedLabel}
        {resolvedTotal === 1 ? "" : "s"} · page {resolvedPage} of {resolvedTotalPages}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {showFirst ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={buildHref(1)}>First</Link>
          </Button>
        ) : null}
        {showPrevious ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={buildHref(resolvedPage - 1)}>Previous</Link>
          </Button>
        ) : null}

        {visiblePages.map((pageNumber) => {
          const isCurrent = pageNumber === resolvedPage;
          return (
            <Button
              key={pageNumber}
              variant={isCurrent ? "default" : "outline"}
              size="sm"
              className="min-w-8 px-2.5"
              asChild={!isCurrent}
              aria-current={isCurrent ? "page" : undefined}
            >
              {isCurrent ? (
                <span>{pageNumber}</span>
              ) : (
                <Link href={buildHref(pageNumber)}>{pageNumber}</Link>
              )}
            </Button>
          );
        })}

        {showNext ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={buildHref(resolvedPage + 1)}>Next</Link>
          </Button>
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
