"use client";

import {
  useTable,
  type Column,
  type ColumnDef,
  type ColumnVisibilityState,
  type ExpandedState,
  type Row,
  type RowData,
  type RowSelectionState,
  type Updater,
} from "@tanstack/react-table";
import { ChevronDown, ChevronRight, Columns3 } from "lucide-react";
import {
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { TablePagination } from "@/components/data-table/table-pagination";
import { useClientTablePagination } from "@/components/data-table/use-client-table-pagination";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  DataTableAlign,
  DataTableColumnMeta,
} from "@/lib/data-table/data-table-column-meta";
import {
  dataTableFeatures,
  type DataTableFeatures,
} from "@/lib/data-table/data-table-features";
import {
  GlobalDataTable,
  type GlobalDataTableProps,
} from "@/lib/data-table/global-data-table";
import { GlobalTableHead } from "@/lib/data-table/global-table-head";
import { selectDataTableRows } from "@/lib/data-table/select-data-table-rows";
import { GlobalTableStickyContext } from "@/lib/data-table/sticky-context";
import type { TableSortComparable, TableSortDirection } from "@/lib/data-table/table-sort";
import { useClientTableSort } from "@/lib/data-table/use-client-table-sort";
import { cn } from "@/utils/cn";

const EMPTY_SORT_ACCESSORS: Record<string, (row: never) => TableSortComparable> = {};

/** Comfortable tap size for DataTable pagination. Other tables keep their size. */
const PAGINATION_BUTTON_CLASSNAME = "min-h-11 min-w-11";

const ICON_BUTTON_CLASSNAME = "size-11 shrink-0";

/**
 * Mixed cell values (text, numbers, badges) do not share one TanStack value
 * type, so column lists use an open value parameter.
 */
export type DataTableColumn<TData extends RowData> = ColumnDef<
  DataTableFeatures,
  TData,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any
>;

export interface DataTableProps<TData extends RowData> {
  data: TData[];
  columns: ReadonlyArray<DataTableColumn<TData>>;
  getRowId: (row: TData, index: number) => string;
  /**
   * Server (or parent) already sorted `data`. The table renders that order.
   * Also implied when `sorting.onSort` is set.
   */
  manualSorting?: boolean;
  /**
   * Server (or parent) already sliced `data` to one page. The table does not
   * slice it again. Also implied when `pagination` is provided.
   */
  manualPagination?: boolean;
  /** Header sort controls. Off unless set. */
  enableSorting?: boolean;
  sorting?: {
    sortKey: string;
    sortDir: TableSortDirection;
    onSort: (columnId: string) => void;
  };
  /** Used only for client sort, when manual sorting is off. */
  sortAccessors?: Record<string, (row: TData) => TableSortComparable>;
  /** In-memory page slicing. Off unless set. Ignored when `pagination` is set. */
  enablePagination?: boolean;
  clientPagination?: {
    pageSize?: number;
    resetKey?: string | number;
  };
  /** Column show/hide menu. Off unless set. */
  enableColumnVisibility?: boolean;
  /** Leading selection checkboxes. Off unless set. */
  enableRowSelection?: boolean;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: (selection: RowSelectionState) => void;
  selectAllLabel?: string;
  getSelectionLabel?: (row: TData) => string;
  /** Leading expand control. Off unless set. */
  enableExpansion?: boolean;
  expandedRowIds?: readonly string[];
  onExpandedRowIdsChange?: (ids: string[]) => void;
  renderExpandedRow?: (row: TData) => ReactNode;
  getExpandLabel?: (row: TData, expanded: boolean) => string;
  /** Trailing actions cell. */
  renderRowActions?: (row: TData) => ReactNode;
  loading?: boolean;
  loadingMessage?: ReactNode;
  errorMessage?: string;
  onRetry?: () => void;
  empty?: boolean;
  emptyMessage?: ReactNode;
  /** `card` is the GlobalDataTable shell. `plain` is an inset with no second card. */
  chrome?: "card" | "plain";
  className?: string;
  tableClassName?: string;
  stickyHeader?: boolean;
  search?: GlobalDataTableProps["search"];
  pageSize?: GlobalDataTableProps["pageSize"];
  toolbarLeading?: ReactNode;
  searchTrailing?: ReactNode;
  toolbarActions?: ReactNode;
  banner?: ReactNode;
  footer?: ReactNode;
  pagination?: GlobalDataTableProps["pagination"];
  itemLabel?: string;
}

function applyUpdater<T>(updater: Updater<T>, current: T): T {
  if (typeof updater === "function") {
    return (updater as (old: T) => T)(current);
  }
  return updater;
}

function alignClass(align: DataTableAlign | undefined): string {
  switch (align) {
    case "end":
      return "text-right tabular-nums";
    case "start":
      return "text-left";
    case undefined:
      return "";
    default: {
      const exhaustive: never = align;
      return exhaustive;
    }
  }
}

function isDetailColumn(meta: DataTableColumnMeta | undefined): boolean {
  const mobile = meta?.mobile;
  switch (mobile) {
    case "detail":
      return true;
    case "primary":
    case undefined:
      return false;
    default: {
      const exhaustive: never = mobile;
      return exhaustive;
    }
  }
}

function columnMeta(column: { columnDef: { meta?: DataTableColumnMeta } }): DataTableColumnMeta {
  return column.columnDef.meta ?? {};
}

function columnLabel<TData extends RowData>(column: Column<DataTableFeatures, TData>): string {
  const header = column.columnDef.header;
  return typeof header === "string" ? header : column.id;
}

function expandedIdsFrom(state: ExpandedState, rowIds: readonly string[]): string[] {
  if (state === true) return [...rowIds];
  return Object.keys(state).filter((id) => state[id]);
}

function DataTableNotice({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "alert";
}) {
  return (
    <div
      role={tone === "alert" ? "alert" : undefined}
      className="flex flex-wrap items-center justify-center gap-3 px-4 py-8 text-center text-sm"
    >
      {children}
    </div>
  );
}

function DataTableError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <DataTableNotice tone="alert">
      <p className="text-destructive">{message}</p>
      <Button type="button" variant="outline" className="min-h-11" onClick={onRetry}>
        Retry
      </Button>
    </DataTableNotice>
  );
}

export function DataTable<TData extends RowData>({
  data,
  columns,
  getRowId,
  manualSorting = false,
  manualPagination = false,
  enableSorting = false,
  sorting,
  sortAccessors,
  enablePagination = false,
  clientPagination,
  enableColumnVisibility = false,
  enableRowSelection = false,
  rowSelection: controlledSelection,
  onRowSelectionChange,
  selectAllLabel = "Select all rows",
  getSelectionLabel,
  enableExpansion = false,
  expandedRowIds,
  onExpandedRowIdsChange,
  renderExpandedRow,
  getExpandLabel,
  renderRowActions,
  loading = false,
  loadingMessage,
  errorMessage,
  onRetry,
  empty = false,
  emptyMessage = "No data.",
  chrome = "card",
  className,
  tableClassName,
  stickyHeader = false,
  search,
  pageSize,
  toolbarLeading,
  searchTrailing,
  toolbarActions,
  banner,
  footer,
  pagination,
  itemLabel = "row",
}: DataTableProps<TData>) {
  const sortingIsManual = manualSorting || Boolean(sorting?.onSort);
  const paginationIsManual = manualPagination || Boolean(pagination);
  const usesClientSorting = enableSorting && !sortingIsManual;
  const usesClientPagination = enablePagination && !paginationIsManual;

  const clientSort = useClientTableSort(
    data,
    (sortAccessors ??
      EMPTY_SORT_ACCESSORS) as Record<string, (row: TData) => TableSortComparable>,
    usesClientSorting
      ? { initialKey: sorting?.sortKey, initialDir: sorting?.sortDir }
      : undefined,
  );

  const sortedForClient = usesClientSorting ? clientSort.sorted : data;
  const clientPage = useClientTablePagination(sortedForClient, {
    pageSize: clientPagination?.pageSize ?? pageSize?.value,
    resetKey: clientPagination?.resetKey,
  });

  const rows = selectDataTableRows({
    data,
    clientSorted: clientSort.sorted,
    clientPage: clientPage.pageItems,
    manualSorting: !usesClientSorting,
    manualPagination: !usesClientPagination,
    sortingEnabled: enableSorting,
    paginationEnabled: enablePagination,
  });

  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});
  const [uncontrolledSelection, setUncontrolledSelection] = useState<RowSelectionState>({});
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState<ExpandedState>({});
  const [openDetailIds, setOpenDetailIds] = useState<ReadonlySet<string>>(() => new Set());

  const selectionState = controlledSelection ?? uncontrolledSelection;
  const expandedKey =
    expandedRowIds === undefined ? undefined : expandedRowIds.join("\0");
  const controlledExpanded = useMemo<ExpandedState | null>(() => {
    if (expandedKey === undefined) return null;
    if (expandedKey === "") return {};
    return Object.fromEntries(expandedKey.split("\0").filter(Boolean).map((id) => [id, true]));
  }, [expandedKey]);
  const expandedState: ExpandedState = controlledExpanded ?? uncontrolledExpanded;

  const activeSortKey = sortingIsManual ? (sorting?.sortKey ?? "") : clientSort.sortKey;
  const activeSortDir: TableSortDirection = sortingIsManual
    ? (sorting?.sortDir ?? "desc")
    : clientSort.sortDir;

  const resolvedColumns = useMemo(() => {
    const leading: DataTableColumn<TData>[] = [];
    if (enableRowSelection) {
      leading.push({
        id: "select",
        enableSorting: false,
        enableHiding: false,
        header: ({ table: headerTable }) => (
          <Checkbox
            checked={
              headerTable.getIsAllPageRowsSelected() ||
              (headerTable.getIsSomePageRowsSelected() ? "indeterminate" : false)
            }
            onCheckedChange={(checked) =>
              headerTable.toggleAllPageRowsSelected(checked === true)
            }
            aria-label={selectAllLabel}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(checked) => row.toggleSelected(checked === true)}
            aria-label={getSelectionLabel?.(row.original) ?? "Select row"}
          />
        ),
        meta: { mobile: "primary", className: "w-12" },
      });
    }
    if (enableExpansion) {
      leading.push({
        id: "expand",
        enableSorting: false,
        enableHiding: false,
        header: () => <span className="sr-only">Expand</span>,
        cell: ({ row }) => {
          const open = row.getIsExpanded();
          return (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={ICON_BUTTON_CLASSNAME}
              aria-expanded={open}
              aria-label={
                getExpandLabel?.(row.original, open) ??
                (open ? "Collapse row" : "Expand row")
              }
              onClick={() => row.toggleExpanded()}
            >
              {open ? (
                <ChevronDown className="size-4" aria-hidden />
              ) : (
                <ChevronRight className="size-4" aria-hidden />
              )}
            </Button>
          );
        },
        meta: { mobile: "primary", className: "w-12 px-2" },
      });
    }

    const trailing: DataTableColumn<TData>[] = [];
    if (renderRowActions) {
      trailing.push({
        id: "actions",
        enableSorting: false,
        enableHiding: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => renderRowActions(row.original),
        meta: { mobile: "primary", align: "end" },
      });
    }

    return [...leading, ...columns, ...trailing];
  }, [
    columns,
    enableExpansion,
    enableRowSelection,
    getExpandLabel,
    getSelectionLabel,
    renderRowActions,
    selectAllLabel,
  ]);

  const table = useTable({
    features: dataTableFeatures,
    data: rows,
    columns: resolvedColumns,
    getRowId,
    enableSorting,
    enableRowSelection,
    enableExpanding: enableExpansion,
    getRowCanExpand: enableExpansion ? () => true : undefined,
    // Rows are resolved before they reach the table. These flags, and the
    // missing sort/page row models, keep TanStack from sorting or slicing again.
    manualSorting: true,
    manualPagination: true,
    manualExpanding: true,
    autoResetExpanded: false,
    autoResetPageIndex: false,
    state: {
      columnVisibility,
      rowSelection: selectionState,
      expanded: expandedState,
    },
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: (updater) => {
      const next = applyUpdater(updater, selectionState);
      if (onRowSelectionChange) {
        onRowSelectionChange(next);
        return;
      }
      setUncontrolledSelection(next);
    },
    onExpandedChange: (updater) => {
      const next = applyUpdater(updater, expandedState);
      if (onExpandedRowIdsChange) {
        onExpandedRowIdsChange(
          expandedIdsFrom(
            next,
            rows.map((row, index) => getRowId(row, index)),
          ),
        );
        return;
      }
      setUncontrolledExpanded(next);
    },
  });

  function handleSort(columnId: string) {
    if (sortingIsManual) {
      sorting?.onSort(columnId);
      return;
    }
    clientSort.toggleSort(columnId);
  }

  function toggleDetail(rowId: string) {
    setOpenDetailIds((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }

  const detailColumns = table
    .getAllLeafColumns()
    .filter((column) => column.getIsVisible() && isDetailColumn(column.columnDef.meta));
  const showRowDetails = detailColumns.length > 0;

  const hideableColumns = enableColumnVisibility
    ? table.getAllLeafColumns().filter((column) => column.getCanHide())
    : [];

  const columnMenu =
    enableColumnVisibility && hideableColumns.length > 0 ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11"
            aria-label="Choose columns"
          >
            <Columns3 aria-hidden />
            Columns
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Columns</DropdownMenuLabel>
          {hideableColumns.map((column) => (
            <DropdownMenuCheckboxItem
              key={column.id}
              checked={column.getIsVisible()}
              onCheckedChange={(checked) => column.toggleVisibility(checked === true)}
            >
              {columnLabel(column)}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;

  const resolvedPagination = pagination
    ? pagination
    : usesClientPagination
      ? {
          total: clientPage.total,
          page: clientPage.page,
          totalPages: clientPage.totalPages,
          itemLabel,
          onPageChange: clientPage.setPage,
        }
      : undefined;

  const showError = Boolean(errorMessage && onRetry && data.length === 0);
  const showLoadingPlaceholder = loading && data.length === 0 && !showError;
  const showEmpty = empty && !showError && !showLoadingPlaceholder;
  const showTable = !showError && !showEmpty && !(showLoadingPlaceholder && loadingMessage);

  const errorNode =
    showError && errorMessage && onRetry ? (
      <DataTableError message={errorMessage} onRetry={onRetry} />
    ) : null;

  const tableContents = (
    <>
      <TableHeader>
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id}>
            {group.headers.map((header) => {
              const meta = columnMeta(header.column);
              const canSort = enableSorting && header.column.getCanSort();
              return (
                <GlobalTableHead
                  key={header.id}
                  colSpan={header.colSpan}
                  className={cn(
                    "h-auto px-2 py-2 text-sm",
                    alignClass(meta.align),
                    meta.align === "end" && "[&_button]:ml-auto",
                    isDetailColumn(meta) && "hidden md:table-cell",
                    meta.headClassName,
                    meta.className,
                  )}
                  sortKey={canSort ? header.column.id : undefined}
                  activeSortKey={activeSortKey}
                  sortDirection={activeSortDir}
                  onSort={canSort ? handleSort : undefined}
                >
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                </GlobalTableHead>
              );
            })}
            {showRowDetails ? (
              <TableHead className="sticky right-0 z-20 w-12 bg-card px-1 py-2 text-sm md:hidden">
                <span className="sr-only">Row details</span>
              </TableHead>
            ) : null}
          </TableRow>
        ))}
      </TableHeader>
      {showLoadingPlaceholder && !loadingMessage ? (
        <DataTableSkeletonBody
          columnCount={
            table.getVisibleLeafColumns().length + (showRowDetails ? 1 : 0)
          }
        />
      ) : (
        <TableBody>
          {table.getRowModel().rows.map((row) => {
            const detailsOpen = openDetailIds.has(row.id);
            const detailsId = `row-details-${row.id}`;
            const colSpan = row.getVisibleCells().length + (showRowDetails ? 1 : 0);
            return (
              <DataTableBodyRows
                key={row.id}
                row={row}
                table={table}
                detailsOpen={detailsOpen}
                detailsId={detailsId}
                colSpan={colSpan}
                showRowDetails={showRowDetails}
                detailColumns={detailColumns}
                onToggleDetail={() => toggleDetail(row.id)}
                expandedContent={
                  enableExpansion && row.getIsExpanded() && renderExpandedRow
                    ? renderExpandedRow(row.original)
                    : null
                }
              />
            );
          })}
        </TableBody>
      )}
    </>
  );

  const pendingClass = loading && data.length > 0 ? "opacity-70" : undefined;

  if (chrome === "plain") {
    return (
      <GlobalTableStickyContext.Provider value={stickyHeader}>
      <div className={cn("min-w-0", className)} aria-busy={loading || undefined}>
        {errorNode}
        {showLoadingPlaceholder && loadingMessage ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">{loadingMessage}</p>
        ) : null}
        {showEmpty ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">{emptyMessage}</p>
        ) : null}
        {showTable ? (
          <div className={pendingClass}>
            <div className="min-w-0 overflow-x-auto">
              <Table scrollContainer={false} className={cn("w-full", tableClassName)}>
                {tableContents}
              </Table>
            </div>
            {footer}
            {resolvedPagination ? (
              <TablePagination
                meta={resolvedPagination}
                buildHref={resolvedPagination.buildHref}
                onPageChange={resolvedPagination.onPageChange}
                buttonClassName={PAGINATION_BUTTON_CLASSNAME}
              />
            ) : null}
          </div>
        ) : null}
      </div>
      </GlobalTableStickyContext.Provider>
    );
  }

  const cardEmptyMessage = errorNode
    ? errorNode
    : showLoadingPlaceholder && loadingMessage
      ? loadingMessage
      : emptyMessage;

  return (
    <div className="min-w-0" aria-busy={loading || undefined}>
      <GlobalDataTable
        className={cn(pendingClass, className)}
        tableClassName={tableClassName}
        stickyHeader={stickyHeader}
        search={search}
        pageSize={pageSize}
        toolbarLeading={toolbarLeading}
        searchTrailing={searchTrailing}
        toolbarActions={
          columnMenu || toolbarActions ? (
            <>
              {toolbarActions}
              {columnMenu}
            </>
          ) : undefined
        }
        banner={banner}
        footer={showTable ? footer : undefined}
        pagination={showTable ? resolvedPagination : undefined}
        paginationButtonClassName={PAGINATION_BUTTON_CLASSNAME}
        empty={!showTable}
        emptyMessage={cardEmptyMessage}
      >
        {tableContents}
      </GlobalDataTable>
    </div>
  );
}

function DataTableSkeletonBody({ columnCount }: { columnCount: number }) {
  return (
    <TableBody>
      {Array.from({ length: 6 }, (_, rowIndex) => (
        <TableRow key={rowIndex} aria-hidden>
          {Array.from({ length: Math.max(columnCount, 1) }, (_, columnIndex) => (
            <TableCell key={columnIndex} className="px-2 py-2">
              <Skeleton className="h-4 w-full max-w-24" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </TableBody>
  );
}

function DataTableBodyRows<TData extends RowData>({
  row,
  table,
  detailsOpen,
  detailsId,
  colSpan,
  showRowDetails,
  detailColumns,
  onToggleDetail,
  expandedContent,
}: {
  row: Row<DataTableFeatures, TData>;
  table: ReturnType<typeof useTable<DataTableFeatures, TData>>;
  detailsOpen: boolean;
  detailsId: string;
  colSpan: number;
  showRowDetails: boolean;
  detailColumns: Column<DataTableFeatures, TData>[];
  onToggleDetail: () => void;
  expandedContent: ReactNode;
}) {
  return (
    <>
      <TableRow data-state={row.getIsSelected() ? "selected" : undefined}>
        {row.getVisibleCells().map((cell) => {
          const meta = columnMeta(cell.column);
          return (
            <TableCell
              key={cell.id}
              className={cn(
                "px-2 py-2",
                alignClass(meta.align),
                meta.wrap
                  ? "whitespace-normal break-words wrap-break-word"
                  : "whitespace-nowrap",
                isDetailColumn(meta) && "hidden md:table-cell",
                meta.className,
              )}
            >
              <table.FlexRender cell={cell} />
            </TableCell>
          );
        })}
        {showRowDetails ? (
          <TableCell className="sticky right-0 z-10 w-12 bg-card px-1 py-2 md:hidden">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={ICON_BUTTON_CLASSNAME}
              aria-expanded={detailsOpen}
              aria-controls={detailsId}
              aria-label={detailsOpen ? "Hide row details" : "Show row details"}
              onClick={onToggleDetail}
            >
              <ChevronDown
                className={cn("size-4 transition-transform", detailsOpen && "rotate-180")}
                aria-hidden
              />
            </Button>
          </TableCell>
        ) : null}
      </TableRow>
      {showRowDetails && detailsOpen ? (
        <TableRow className="bg-muted/20 hover:bg-muted/20 md:hidden">
          <TableCell id={detailsId} colSpan={colSpan} className="px-3 py-3">
            <dl className="grid gap-3">
              {detailColumns.map((column) => {
                const cell = row.getAllCells().find((item) => item.column.id === column.id);
                if (!cell) return null;
                return (
                  <div key={column.id} className="min-w-0">
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {columnLabel(column)}
                    </dt>
                    <dd className="mt-1 min-w-0 text-sm wrap-break-word">
                      <table.FlexRender cell={cell} />
                    </dd>
                  </div>
                );
              })}
            </dl>
          </TableCell>
        </TableRow>
      ) : null}
      {expandedContent ? (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={colSpan} className="p-0">
            <div className="w-0 min-w-full">{expandedContent}</div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}
