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
  /** Freeze toolbar + column headers on page scroll. Track: `sticky table header`. */
  stickyHeader?: boolean;
  /** Wrap table in horizontal scroll container. */
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
  const [toolbarHeight, setToolbarHeight] = useState(0);
  const hasToolbar = Boolean(search || pageSize || toolbarActions || toolbarLeading);

  useEffect(() => {
    if (!stickyHeader || !hasToolbar) return;
    const el = toolbarRef.current;
    if (!el) return;

    const updateHeight = () => setToolbarHeight(el.getBoundingClientRect().height);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, [stickyHeader, hasToolbar]);

  const toolbarLeadingContent = (
    <>
      {pageSize ? (
        <TablePageSizeSelect value={pageSize.value} onChange={pageSize.onChange} />
      ) : null}
      {toolbarLeading}
    </>
  );

  const toolbar = hasToolbar ? (
    <TableSearchToolbar
      value={search?.value ?? ""}
      onChange={search?.onChange ?? (() => {})}
      placeholder={search?.placeholder}
      suggestions={search?.suggestions}
      className={stickyHeader ? "border-b-0" : undefined}
      leading={toolbarLeadingContent}
    >
      {toolbarActions}
    </TableSearchToolbar>
  ) : null;

  const shellStyle =
    stickyHeader && hasToolbar
      ? ({
          "--sticky-toolbar-height": `${toolbarHeight}px`,
        } as CSSProperties)
      : undefined;

  return (
    <GlobalTableStickyContext.Provider value={stickyHeader}>
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
            {scrollable ? (
              <DataTableScroll>
                <Table scrollContainer={!stickyHeader}>{children}</Table>
              </DataTableScroll>
            ) : (
              <Table scrollContainer={!stickyHeader}>{children}</Table>
            )}
            {footer}
            {pagination ? (
              <TablePagination meta={pagination} buildHref={pagination.buildHref} />
            ) : null}
          </>
        )}
      </DataTableShell>
    </GlobalTableStickyContext.Provider>
  );
}
