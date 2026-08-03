"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import {
  DataTableEmptyContent,
  DataTableScroll,
  DataTableShell,
} from "@/components/data-table/data-table-shell";
import { TablePagination } from "@/components/data-table/table-pagination";
import { TablePageSizeSelect } from "@/components/data-table/table-page-size-select";
import { TABLE_STICKY_TOOLBAR_CLASSNAME } from "@/components/data-table/table-sticky";
import { TableSearchToolbar } from "@/components/data-table/table-search-bar";
import { Table } from "@/components/ui/table";
import { GlobalTableStickyContext } from "@/lib/data-table/sticky-context";
import type {
  GlobalDataTablePageSize,
  GlobalDataTablePagination,
  GlobalDataTableSearch,
} from "@/lib/data-table/types";
import { cn } from "@/utils/cn";

export interface GlobalDataTableProps {
  children: ReactNode;
  className?: string;
  /**
   * Freeze toolbar + column headers on page scroll. Track: `sticky table header`.
   * The freeze is dropped automatically while the table is too wide for its card
   * (narrow viewports) so the table can scroll horizontally instead of overflowing.
   */
  stickyHeader?: boolean;
  /** Wrap table in horizontal scroll container. Redundant with stickyHeader, which scrolls on demand. */
  scrollable?: boolean;
  search?: GlobalDataTableSearch;
  pageSize?: GlobalDataTablePageSize;
  /** Extra controls before search (after Show dropdown). */
  toolbarLeading?: ReactNode;
  toolbarActions?: ReactNode;
  /** Banner row between toolbar and table (e.g. active URL filters). */
  banner?: ReactNode;
  /** Content between table and pagination (e.g. client-filter empty hint). */
  footer?: ReactNode;
  pagination?: GlobalDataTablePagination;
  empty?: boolean;
  emptyMessage?: string;
}

/**
 * Global reusable data table — one UI shell for all app tables.
 *
 * Location: `src/lib/data-table/` (outside feature components).
 * Includes: card shell, toolbar (Show / search / actions), sticky header option,
 * table body slot, pagination footer.
 *
 * Usage: pass `<TableHeader>` + `<TableBody>` as children; use `GlobalTableHead` for columns.
 */
export function GlobalDataTable({
  children,
  className,
  stickyHeader = false,
  scrollable = false,
  search,
  pageSize,
  toolbarLeading,
  toolbarActions,
  banner,
  footer,
  pagination,
  empty = false,
  emptyMessage = "No data.",
}: GlobalDataTableProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [toolbarHeight, setToolbarHeight] = useState(0);
  // Starts pessimistic: the server can't measure, and a table that scrolls when
  // it didn't need to is invisible, while one that spills before hydration is not.
  const [overflowsCard, setOverflowsCard] = useState(true);
  const hasSearch = Boolean(search);
  const hasToolbar = Boolean(search || pageSize || toolbarActions || toolbarLeading);
  /**
   * responsive table: sticky headers need a scrollport-free ancestor chain, but
   * a horizontally scrolling wrapper *is* a scrollport — the two can't coexist.
   * So the freeze only stays on while the table still fits its card; once it
   * doesn't (tablet/mobile widths, wide column sets) the wrapper takes over and
   * the table scrolls sideways instead of spilling out of the card.
   */
  const frozenHeader = stickyHeader && !overflowsCard;

  useEffect(() => {
    // No table rendered — nothing to measure; the stale value is unused until
    // the table comes back, and this effect re-runs (and re-measures) then.
    if (!stickyHeader || empty) return;
    const wrap = tableWrapRef.current;
    const table = tableRef.current;
    if (!wrap || !table) return;

    // Measured the same way in both modes (the wrapper always spans the card
    // width, the table always reports its natural width), so toggling the
    // wrapper's overflow can't feed back into the measurement.
    const measure = () =>
      setOverflowsCard(table.scrollWidth > wrap.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    observer.observe(table);
    return () => observer.disconnect();
  }, [stickyHeader, empty]);

  useEffect(() => {
    if (!stickyHeader || !hasToolbar) {
      setToolbarHeight(0);
      return;
    }
    const el = toolbarRef.current;
    if (!el) return;

    const updateHeight = () => setToolbarHeight(el.getBoundingClientRect().height);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, [stickyHeader, hasToolbar]);

  const toolbarLeadingContent =
    pageSize || toolbarLeading ? (
      <>
        {pageSize ? (
          <TablePageSizeSelect value={pageSize.value} onChange={pageSize.onChange} />
        ) : null}
        {toolbarLeading}
      </>
    ) : null;

  const toolbar = hasToolbar ? (
    <TableSearchToolbar
      value={search?.value ?? ""}
      onChange={search?.onChange ?? (() => {})}
      placeholder={search?.placeholder}
      suggestions={search?.suggestions}
      className={stickyHeader ? "border-b-0" : undefined}
      leading={toolbarLeadingContent}
      showSearch={hasSearch}
    >
      {toolbarActions}
    </TableSearchToolbar>
  ) : null;

  const shellStyle = stickyHeader
    ? ({
        "--sticky-toolbar-height": `${hasToolbar ? toolbarHeight : 0}px`,
      } as CSSProperties)
    : undefined;

  return (
    <GlobalTableStickyContext.Provider value={frozenHeader}>
      <DataTableShell
        className={cn(stickyHeader && "overflow-visible", className)}
        style={shellStyle}
      >
        {hasToolbar ? (
          stickyHeader ? (
            <div ref={toolbarRef} className={TABLE_STICKY_TOOLBAR_CLASSNAME}>
              {toolbar}
            </div>
          ) : (
            toolbar
          )
        ) : null}

        {banner}

        {empty ? (
          <DataTableEmptyContent message={emptyMessage} />
        ) : (
          <>
            {/*
              sticky table header: the wrapper stays overflow-visible while the
              header is frozen — overflow-x-auto forces a scrollport and makes
              the sticky `top` offset apply inside the table, covering the first
              body row(s). It flips to overflow-x-auto only once the table no
              longer fits, at which point the header is no longer frozen.
            */}
            {stickyHeader ? (
              <div
                ref={tableWrapRef}
                className={cn(
                  "relative w-full",
                  overflowsCard ? "overflow-x-auto" : "overflow-visible",
                )}
              >
                <Table ref={tableRef} scrollContainer={false}>
                  {children}
                </Table>
              </div>
            ) : scrollable ? (
              <DataTableScroll>
                <Table>{children}</Table>
              </DataTableScroll>
            ) : (
              <Table>{children}</Table>
            )}
            {footer}
            {pagination ? (
              <TablePagination
                meta={pagination}
                buildHref={pagination.buildHref}
                onPageChange={pagination.onPageChange}
              />
            ) : null}
          </>
        )}
      </DataTableShell>
    </GlobalTableStickyContext.Provider>
  );
}
