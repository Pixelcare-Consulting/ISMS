"use client";

import { useTable } from "@tanstack/react-table";
import type { BranchOrderType } from "@prisma/client";
import { CircleHelp, Trash2 } from "lucide-react";
import { createContext, useContext, useId, useMemo, useState, type ReactNode } from "react";

import { WorksheetLineNote } from "@/app/(app)/orders/_components/worksheet-line-note";
import { WorksheetModelLabel } from "@/app/(app)/orders/_components/worksheet-model-label";
import { TablePagination } from "@/components/data-table/table-pagination";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  APPROVED_BEFORE_REVIEW_RECORD,
  type OrderReviewSnapshot,
} from "@/features/orders/lib/order-review-snapshot";
import {
  EMPTY_WORKSHEET_LINE_FILTER,
  paginateWorksheetLines,
  visibleWorksheetLines,
  WORKSHEET_PAGE_SIZE,
  worksheetOrderTotals,
  worksheetRequestedFooter,
  worksheetTotalsLabel,
  type WorksheetLineFilter,
} from "@/features/orders/lib/order-worksheet-filters";
import {
  projectWorksheetLines,
  type ProjectedWorksheetLine,
  type WorksheetDraftInput,
} from "@/features/orders/lib/order-worksheet-rows";
import {
  formatWorksheetCbm,
  NO_PLANNING_SUGGESTION_MESSAGE,
  worksheetLineCbm,
} from "@/features/orders/lib/order-worksheet-metrics";
import {
  OFF_PLANOGRAM_SUGGESTION_REASON,
  type OrderAnalyticsBrand,
  type OrderWorksheetInventory,
  type OrderWorksheetLine,
  type OrderWorksheetSummary,
} from "@/features/orders/types/order-analytics";
import {
  type DataTableColumn,
  type DataTableColumnMeta,
  GlobalTableHead,
} from "@/lib/data-table";
import { dataTableFeatures } from "@/lib/data-table/data-table-features";
import { GlobalTableStickyContext } from "@/lib/data-table/sticky-context";
import { cn } from "@/utils/cn";
import { formatPeso } from "@/utils/format-currency";

/** Status chips already named in the stock list. */
const NAMED_STATUS_CODES = new Set(["STK", "DEF", "DIT"]);

/** Plain-language column help for branch staff and Supply Planning. */
const WORKSHEET_COLUMN_HELP = {
  model: "SKU or model code and name on this order.",
  onHand:
    "Branch stock in STK status. This includes STK units still pending defect inspection. Units on the way are not included.",
  suggestShelf:
    "Shelf gap. Shelf maximum minus units on hand. The shelf maximum is shown under the suggestion. This is not the planning forecast.",
  suggestPlan:
    "Comes from the released plan. This is the remaining Drop 1 for this branch and model after quantities already on a draft or order. When the model has a shelf maximum, it is shown under the suggestion.",
  cbm: "Cubic meters for this line. When a quantity is entered, this is that quantity times the model's CBM. Otherwise it is the model's own CBM. 0.0000 means the model has no CBM.",
  requested: "Quantity the branch asked for. Zero means the row is not part of the order.",
  approved: "Quantity Supply Planning is allowing. It cannot be higher than the request.",
  note: "Remark from the person who created the order.",
  spNote:
    "Remark from Supply Planning for this line. Only filled while Supply Planning is reviewing.",
  details:
    "Opens the rest of the stock picture, such as incoming, open orders, defective, and pull-out.",
} as const;

export interface OrderWorksheetProps {
  lines: OrderWorksheetLine[];
  brands: OrderAnalyticsBrand[];
  drafts: Readonly<Record<string, WorksheetDraftInput | undefined>>;
  mode: "create" | "view" | "review";
  orderType: BranchOrderType;
  loading?: boolean;
  error?: string | null;
  summary: OrderWorksheetSummary | null;
  summaryMode: "current" | "snapshot" | "missing-snapshot";
  snapshot?: OrderReviewSnapshot | null;
  snapshotAtLabel?: string | null;
  showApprovedQty: boolean;
  approvedQtyEditable: boolean;
  showSpRemarks: boolean;
  spRemarksEditable: boolean;
  onRequestedQtyChange?: (modelId: string, quantity: number) => void;
  onRemarksChange?: (modelId: string, remarks: string) => void;
  onApprovedQtyChange?: (modelId: string, quantity: number) => void;
  onSpRemarksChange?: (modelId: string, remarks: string) => void;
  onRemoveAdditional?: (modelId: string) => void;
  /** Create-mode control on the right of the filter row. Hidden on view and review. */
  filterAction?: ReactNode;
  footer?: ReactNode;
}

export function OrderWorksheet({
  lines,
  brands,
  drafts,
  mode,
  orderType,
  loading = false,
  error = null,
  summary,
  summaryMode,
  snapshot = null,
  snapshotAtLabel = null,
  showApprovedQty,
  approvedQtyEditable,
  showSpRemarks,
  spRemarksEditable,
  onRequestedQtyChange,
  onRemarksChange,
  onApprovedQtyChange,
  onSpRemarksChange,
  onRemoveAdditional,
  filterAction,
  footer,
}: OrderWorksheetProps) {
  const [filter, setFilter] = useState<WorksheetLineFilter>(EMPTY_WORKSHEET_LINE_FILTER);
  const [page, setPage] = useState(1);
  const projectionMode = mode === "create" ? "create" : "readonly";
  const storedRows = useMemo(
    () => projectWorksheetLines(lines, drafts, orderType, projectionMode),
    [lines, drafts, orderType, projectionMode],
  );
  const visibleRows = useMemo(
    () => visibleWorksheetLines(storedRows, filter),
    [storedRows, filter],
  );
  const pageSlice = useMemo(
    () => paginateWorksheetLines(visibleRows, page, WORKSHEET_PAGE_SIZE),
    [page, visibleRows],
  );
  const totals = useMemo(
    () => worksheetOrderTotals(storedRows, { includeApproved: showApprovedQty }),
    [storedRows, showApprovedQty],
  );
  const requestedFooter = useMemo(
    () => worksheetRequestedFooter(visibleRows),
    [visibleRows],
  );
  const grid = useMemo<WorksheetGridContextValue>(
    () => ({
      mode,
      orderType,
      approvedQtyEditable,
      spRemarksEditable,
      indexOffset: pageSlice.indexOffset,
      onRequestedQtyChange,
      onRemarksChange,
      onApprovedQtyChange,
      onSpRemarksChange,
      onRemoveAdditional,
    }),
    [
      approvedQtyEditable,
      mode,
      onApprovedQtyChange,
      onRemarksChange,
      onRemoveAdditional,
      onRequestedQtyChange,
      onSpRemarksChange,
      orderType,
      pageSlice.indexOffset,
      spRemarksEditable,
    ],
  );
  const columns = useMemo(
    () =>
      worksheetColumns({
        mode,
        orderType,
        showApprovedQty,
        showSpRemarks,
      }),
    [mode, orderType, showApprovedQty, showSpRemarks],
  );

  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col",
        mode === "create" ? "gap-4" : "gap-3",
      )}
    >
      <WorksheetSummary
        mode={mode}
        summaryMode={summaryMode}
        summary={summary}
        snapshot={snapshot}
        snapshotAtLabel={snapshotAtLabel}
        totals={totals}
        showApprovedQty={showApprovedQty}
      />
      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
        <WorksheetFilters
          filter={filter}
          brands={brands}
          onChange={(next) => {
            setFilter(next);
            setPage(1);
          }}
          action={mode === "create" ? filterAction : null}
        />
        {loading && lines.length === 0 ? (
          <WorksheetSkeleton showApproved={showApprovedQty} showSpRemarks={showSpRemarks} />
        ) : visibleRows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {lines.length === 0
              ? "This branch has no models to order yet."
              : "No models match."}
          </p>
        ) : (
          <WorksheetGridContext.Provider value={grid}>
            <WorksheetLinesTable rows={pageSlice.rows} columns={columns} />
            <div className="shrink-0">
              <TablePagination
                page={pageSlice.page}
                totalPages={pageSlice.totalPages}
                total={pageSlice.total}
                label="model"
                summary={worksheetTotalsLabel(
                  requestedFooter.lineCount,
                  requestedFooter.quantity,
                )}
                onPageChange={setPage}
              />
            </div>
          </WorksheetGridContext.Provider>
        )}
      </div>
      {footer ? <div className="shrink-0">{footer}</div> : null}
    </div>
  );
}

interface WorksheetGridContextValue {
  mode: OrderWorksheetProps["mode"];
  orderType: BranchOrderType;
  approvedQtyEditable: boolean;
  spRemarksEditable: boolean;
  /** 0-based start of this page in the filtered list. */
  indexOffset: number;
  onRequestedQtyChange?: OrderWorksheetProps["onRequestedQtyChange"];
  onRemarksChange?: OrderWorksheetProps["onRemarksChange"];
  onApprovedQtyChange?: OrderWorksheetProps["onApprovedQtyChange"];
  onSpRemarksChange?: OrderWorksheetProps["onSpRemarksChange"];
  onRemoveAdditional?: OrderWorksheetProps["onRemoveAdditional"];
}

const WorksheetGridContext = createContext<WorksheetGridContextValue | null>(null);

function useWorksheetGrid(): WorksheetGridContextValue {
  const value = useContext(WorksheetGridContext);
  if (!value) {
    throw new Error("Order worksheet cells rendered outside the sheet.");
  }
  return value;
}

interface WorksheetColumnInput {
  mode: OrderWorksheetProps["mode"];
  orderType: BranchOrderType;
  showApprovedQty: boolean;
  showSpRemarks: boolean;
}

/**
 * Help sits beside the label. Pointer and click events stay on the control so a
 * sortable header does not treat the question mark as a sort click.
 */
function WorksheetHeader({
  label,
  help,
  alignEnd = false,
  hideLabel = false,
}: {
  label: string;
  help: string;
  alignEnd?: boolean;
  hideLabel?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full flex-wrap items-center gap-0.5",
        alignEnd && "w-full justify-end",
      )}
    >
      <span className={hideLabel ? "sr-only" : undefined}>{label}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`About ${label}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <CircleHelp className="size-3.5" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          sideOffset={6}
          className="z-[100] max-w-64 text-left leading-relaxed"
        >
          {help}
        </TooltipContent>
      </Tooltip>
    </span>
  );
}

function suggestHelp(orderType: BranchOrderType): string {
  switch (orderType) {
    case "auto_replenish":
      return WORKSHEET_COLUMN_HELP.suggestPlan;
    case "manual":
    case "special":
      return WORKSHEET_COLUMN_HELP.suggestShelf;
    default: {
      const _exhaustive: never = orderType;
      return _exhaustive;
    }
  }
}

/** Hug the line number (1, 2, 10). The rest of the sheet shares the width that remains. */
const INDEX_COLUMN_WIDTH = "2.75rem";

function shareWidth(weight: number, total: number): string {
  const share = total > 0 ? weight / total : 0;
  return `calc((100% - ${INDEX_COLUMN_WIDTH}) * ${share})`;
}

function worksheetColumns(input: WorksheetColumnInput): DataTableColumn<ProjectedWorksheetLine>[] {
  const weights = [
    31,
    9,
    13,
    9,
    8,
    input.showApprovedQty ? 9 : 0,
    input.showSpRemarks ? 10 : 13,
    input.showSpRemarks ? 10 : 0,
    12,
    input.mode === "create" ? 5 : 0,
  ];
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const width = (index: number) => shareWidth(weights[index] ?? 0, total);
  const columns: DataTableColumn<ProjectedWorksheetLine>[] = [
    {
      id: "index",
      header: () => <span>No.</span>,
      meta: {
        width: INDEX_COLUMN_WIDTH,
        className: "whitespace-nowrap px-2 align-middle tabular-nums",
        headClassName: "whitespace-nowrap px-2",
      },
      cell: IndexColumnCell,
    },
    {
      id: "model",
      header: () => <WorksheetHeader label="SKU/Model" help={WORKSHEET_COLUMN_HELP.model} />,
      meta: fitColumn(width(0), undefined, "top"),
      cell: ModelColumnCell,
    },
    {
      id: "inventory",
      header: () => (
        <WorksheetHeader label="Branch Stock — STK" help={WORKSHEET_COLUMN_HELP.onHand} alignEnd />
      ),
      meta: fitColumn(width(1), "end"),
      cell: OnHandColumnCell,
    },
    {
      id: "sug",
      header: () => (
        <WorksheetHeader label="Suggest" help={suggestHelp(input.orderType)} alignEnd />
      ),
      meta: fitColumn(width(2), "end"),
      cell: SuggestColumnCell,
    },
    {
      id: "requested",
      header: () => (
        <WorksheetHeader
          label={input.mode === "create" ? "Qty" : "Requested"}
          help={WORKSHEET_COLUMN_HELP.requested}
          alignEnd
        />
      ),
      meta: fitColumn(width(3), "end"),
      cell: RequestedColumnCell,
    },
    {
      id: "cbm",
      header: () => <WorksheetHeader label="CBM" help={WORKSHEET_COLUMN_HELP.cbm} alignEnd />,
      meta: fitColumn(width(4), "end"),
      cell: CbmColumnCell,
    },
  ];

  if (input.showApprovedQty) {
    columns.push({
      id: "approved",
      header: () => (
        <WorksheetHeader label="Approved" help={WORKSHEET_COLUMN_HELP.approved} alignEnd />
      ),
      meta: fitColumn(width(5), "end"),
      cell: ApprovedColumnCell,
    });
  }

  columns.push({
    id: "remarks",
    header: () => (
      <WorksheetHeader label="Note" help={WORKSHEET_COLUMN_HELP.note} />
    ),
    meta: fitColumn(width(6)),
    cell: RemarksColumnCell,
  });

  if (input.showSpRemarks) {
    columns.push({
      id: "spRemarks",
      header: () => (
        <WorksheetHeader label="SP note" help={WORKSHEET_COLUMN_HELP.spNote} />
      ),
      meta: fitColumn(width(7)),
      cell: SpRemarksColumnCell,
    });
  }

  columns.push({
    id: "details",
      header: () => (
        <WorksheetHeader label="Details" help={WORKSHEET_COLUMN_HELP.details} />
      ),
    meta: fitColumn(width(8)),
    cell: DetailsColumnCell,
  });

  if (input.mode === "create") {
    columns.push({
      id: "remove",
      header: () => <span className="sr-only">Remove</span>,
      meta: fitColumn(width(9)),
      cell: RemoveColumnCell,
    });
  }

  return columns;
}

function fitColumn(
  width: string,
  align?: DataTableColumnMeta["align"],
  vertical: "middle" | "top" = "middle",
): DataTableColumnMeta {
  return {
    width,
    align,
    className: cn(
      "min-w-0 overflow-visible whitespace-normal px-2",
      vertical === "top" ? "align-top" : "align-middle",
    ),
    headClassName: "min-w-0 whitespace-normal px-2",
  };
}

function worksheetRowId(row: ProjectedWorksheetLine): string {
  return row.modelId;
}

interface WorksheetBodyCellProps {
  row: { index: number; original: ProjectedWorksheetLine };
}

function IndexColumnCell({ row }: WorksheetBodyCellProps) {
  const { indexOffset } = useWorksheetGrid();
  return <span className="tabular-nums">{indexOffset + row.index + 1}</span>;
}

function ModelColumnCell({ row }: WorksheetBodyCellProps) {
  return <ModelCell row={row.original} />;
}

function OnHandColumnCell({ row }: WorksheetBodyCellProps) {
  return <OnHandCell inventory={row.original.inventory} />;
}

function SuggestColumnCell({ row }: WorksheetBodyCellProps) {
  const { orderType } = useWorksheetGrid();
  return <SuggestCell row={row.original} orderType={orderType} />;
}

function RequestedColumnCell({ row }: WorksheetBodyCellProps) {
  const { mode, orderType, onRequestedQtyChange } = useWorksheetGrid();
  return (
    <RequestedCell
      row={row.original}
      mode={mode}
      orderType={orderType}
      onRequestedQtyChange={onRequestedQtyChange}
    />
  );
}

function CbmColumnCell({ row }: WorksheetBodyCellProps) {
  return (
    <>{formatWorksheetCbm(worksheetLineCbm(row.original.requestedQty, row.original.cbm))}</>
  );
}

function ApprovedColumnCell({ row }: WorksheetBodyCellProps) {
  const { approvedQtyEditable, onApprovedQtyChange } = useWorksheetGrid();
  return (
    <ApprovedCell
      row={row.original}
      editable={approvedQtyEditable}
      onApprovedQtyChange={onApprovedQtyChange}
    />
  );
}

function RemarksColumnCell({ row }: WorksheetBodyCellProps) {
  const { mode, onRemarksChange } = useWorksheetGrid();
  return (
    <RemarksCell row={row.original} mode={mode} onRemarksChange={onRemarksChange} />
  );
}

function SpRemarksColumnCell({ row }: WorksheetBodyCellProps) {
  const { spRemarksEditable, onSpRemarksChange } = useWorksheetGrid();
  return (
    <SpRemarksCell
      row={row.original}
      editable={spRemarksEditable}
      onSpRemarksChange={onSpRemarksChange}
    />
  );
}

function DetailsColumnCell({ row }: WorksheetBodyCellProps) {
  const { orderType } = useWorksheetGrid();
  return <LineDetails row={row.original} orderType={orderType} />;
}

function RemoveColumnCell({ row }: WorksheetBodyCellProps) {
  const { onRemoveAdditional } = useWorksheetGrid();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-8"
      onClick={() => onRemoveAdditional?.(row.original.modelId)}
      aria-label={`Remove line ${row.original.skuCode}`}
    >
      <Trash2 className="size-4" />
    </Button>
  );
}

function WorksheetLinesTable({
  rows,
  columns,
}: {
  rows: ProjectedWorksheetLine[];
  columns: DataTableColumn<ProjectedWorksheetLine>[];
}) {
  const table = useTable({
    features: dataTableFeatures,
    data: rows,
    columns,
    getRowId: worksheetRowId,
    manualSorting: true,
    manualPagination: true,
    autoResetPageIndex: false,
  });

  return (
    <TooltipProvider delayDuration={200}>
      <GlobalTableStickyContext.Provider value>
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
          <table className="w-full table-fixed caption-bottom text-sm">
            <TableHeader>
              {table.getHeaderGroups().map((group) => (
                <TableRow key={group.id} className="hover:bg-transparent">
                  {group.headers.map((header) => {
                    const meta = header.column.columnDef.meta;
                    return (
                      <GlobalTableHead
                        key={header.id}
                        colSpan={header.colSpan}
                        style={meta?.width ? { width: meta.width } : undefined}
                        className={cn(
                          "h-auto min-h-9 bg-card px-2 py-1 align-middle text-xs font-medium normal-case tracking-normal text-muted-foreground",
                          meta?.align === "end" && "text-right",
                          meta?.headClassName,
                        )}
                      >
                        {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                      </GlobalTableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      style={
                        cell.column.columnDef.meta?.width
                          ? { width: cell.column.columnDef.meta.width }
                          : undefined
                      }
                      className={bodyCellClass(cell.column.columnDef.meta)}
                    >
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </table>
        </div>
      </GlobalTableStickyContext.Provider>
    </TooltipProvider>
  );
}

function bodyCellClass(meta: DataTableColumnMeta | undefined): string {
  return cn(
    "px-2 py-1.5 align-middle",
    meta?.align === "end" && "text-right tabular-nums",
    meta?.className,
  );
}

function ModelCell({ row }: { row: ProjectedWorksheetLine }) {
  return <WorksheetModelLabel skuCode={row.skuCode} name={row.name} />;
}

function ShelfMaxLine({ shelfMax }: { shelfMax: number | null }) {
  if (shelfMax == null) return null;
  return (
    <span className="block max-w-full text-right text-[11px] font-normal leading-tight whitespace-normal text-muted-foreground">
      Shelf max {formatQty(shelfMax)}
    </span>
  );
}

function SuggestCell({
  row,
  orderType,
}: {
  row: ProjectedWorksheetLine;
  orderType: BranchOrderType;
}) {
  const caption = suggestionCaption(row, orderType);
  const shelf = <ShelfMaxLine shelfMax={row.shelfMax} />;
  if (
    orderType === "auto_replenish" &&
    row.suggestionUnavailableReason === NO_PLANNING_SUGGESTION_MESSAGE
  ) {
    return (
      <span className="flex w-full min-w-0 flex-col items-end gap-1 text-right leading-tight">
        <span className="text-xs whitespace-normal text-muted-foreground">
          {NO_PLANNING_SUGGESTION_MESSAGE}
        </span>
        {shelf}
      </span>
    );
  }
  if (row.sugQty == null) {
    return (
      <span className="flex w-full min-w-0 flex-col items-end gap-1 leading-tight" title={caption}>
        <span className="text-muted-foreground">—</span>
        {shelf}
      </span>
    );
  }
  return (
    <span className="flex w-full min-w-0 flex-col items-end gap-1 leading-tight" title={caption}>
      <span className={cn("tabular-nums", row.sugQty === 0 && "text-muted-foreground")}>
        {formatQty(row.sugQty)}
      </span>
      {shelf}
    </span>
  );
}

function OnHandCell({ inventory }: { inventory: OrderWorksheetInventory }) {
  return <span title={stockHoverTitle(inventory)}>{formatQty(inventory.onHandQty)}</span>;
}

function stockHoverTitle(inventory: OrderWorksheetInventory): string {
  return [
    `Branch Stock — STK ${formatQty(inventory.onHandQty)}`,
    `Available to sell ${formatQty(inventory.availableToSellQty)}`,
    `Defective ${formatQty(inventory.defectiveQty)}`,
    `Awaiting pull-out ${formatQty(inventory.awaitingPulloutQty)}`,
    `Incoming to Branch — DIT ${formatQty(inventory.transitIncomingQty)}`,
    `In transit, going out ${formatQty(inventory.transitOutgoingQty)}`,
    `In transit, not classified ${formatQty(inventory.transitUnclassifiedQty)}`,
  ].join(", ");
}

function LineDetails({
  row,
  orderType,
}: {
  row: ProjectedWorksheetLine;
  orderType: BranchOrderType;
}) {
  const inventory = row.inventory;
  const extra = inventory.byStatus.filter(
    (status) => status.count > 0 && !NAMED_STATUS_CODES.has(status.code),
  );
  const source = row.additionalItem
    ? "Added for this order"
    : row.onPlanogram
      ? "On the shelf plan"
      : "Not on the shelf plan";

  return (
    <Popover modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs font-normal text-muted-foreground"
          aria-label={`Details for ${row.skuCode}`}
        >
          Details
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" collisionPadding={16} className="z-[100] w-80 p-0">
        <div className="border-b px-3 py-2.5">
          <p className="font-medium">{row.skuCode}</p>
          <p className="text-sm text-muted-foreground">{row.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {source}
            {row.brandName ? ` · ${row.brandName}` : ""}
          </p>
        </div>
        <div className="space-y-3 px-3 py-2.5">
          <DetailList
            title="Stock"
            rows={[
              { label: "Branch Stock — STK", value: formatQty(inventory.onHandQty) },
              { label: "Available to sell", value: formatQty(inventory.availableToSellQty) },
              { label: "Defective", value: formatQty(inventory.defectiveQty) },
              { label: "Awaiting pull-out", value: formatQty(inventory.awaitingPulloutQty) },
              { label: "Incoming to Branch — DIT", value: formatQty(inventory.transitIncomingQty) },
              { label: "In transit, going out", value: formatQty(inventory.transitOutgoingQty) },
              {
                label: "In transit, not classified",
                value: formatQty(inventory.transitUnclassifiedQty),
              },
              ...extra.map((status) => ({
                label: status.code,
                value: formatQty(status.count),
              })),
            ]}
          />
          <DetailList
            title="Orders"
            rows={[
              { label: "Sold", value: formatCount(row.salesQty, row.salesUnavailable) },
              { label: "Incoming", value: formatQty(row.incomingQty) },
              { label: "Open orders", value: formatQty(row.outstandingOrderQty) },
            ]}
          />
          {row.remarks.trim() ? (
            <p className="text-sm whitespace-pre-wrap">
              <span className="text-muted-foreground">Note. </span>
              {row.remarks.trim()}
            </p>
          ) : null}
          {row.spRemarks.trim() ? (
            <p className="text-sm whitespace-pre-wrap">
              <span className="text-muted-foreground">SP note. </span>
              {row.spRemarks.trim()}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">{suggestionCaption(row, orderType)}</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DetailList({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string }[];
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{title}</p>
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd
              className={cn(
                "text-right tabular-nums",
                (row.value === "0" || row.value === "N/A") && "text-muted-foreground",
              )}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function RequestedCell({
  row,
  mode,
  orderType,
  onRequestedQtyChange,
}: {
  row: ProjectedWorksheetLine;
  mode: OrderWorksheetProps["mode"];
  orderType: BranchOrderType;
  onRequestedQtyChange?: OrderWorksheetProps["onRequestedQtyChange"];
}) {
  if (mode !== "create") {
    return <span>{formatQty(row.requestedQty)}</span>;
  }
  const blockedReason =
    !row.requestable
      ? row.onPlanogram && row.sugQty === 0
        ? "Shelf full"
        : "Not available to order"
      : undefined;
  return (
    <Input
      type="number"
      size={4}
      min={0}
      max={orderType === "manual" && row.sugQty != null ? row.sugQty : undefined}
      disabled={!row.requestable}
      className={cn("ml-auto h-8 w-full min-w-0 text-right", !row.requestable && "bg-muted")}
      value={row.requestedQty}
      title={blockedReason}
      aria-label={`Requested quantity for ${row.skuCode}`}
      onChange={(event) => onRequestedQtyChange?.(row.modelId, Number(event.target.value))}
    />
  );
}

function ApprovedCell({
  row,
  editable,
  onApprovedQtyChange,
}: {
  row: ProjectedWorksheetLine;
  editable: boolean;
  onApprovedQtyChange?: OrderWorksheetProps["onApprovedQtyChange"];
}) {
  const approvalLocked = row.requestedQty < 1;
  if (!editable) {
    return <span>{row.approvedQty == null ? "—" : formatQty(row.approvedQty)}</span>;
  }
  return (
    <Input
      type="number"
      size={4}
      min={1}
      max={row.requestedQty}
      disabled={approvalLocked}
      className="ml-auto h-8 w-full min-w-0 text-right disabled:bg-muted"
      value={approvalLocked ? "" : (row.approvedQty ?? row.requestedQty)}
      aria-label={`Approved quantity for ${row.skuCode}`}
      title={approvalLocked ? "Approval applies only to lines with a requested quantity." : undefined}
      onChange={(event) => onApprovedQtyChange?.(row.modelId, Number(event.target.value))}
    />
  );
}

function RemarksCell({
  row,
  mode,
  onRemarksChange,
}: {
  row: ProjectedWorksheetLine;
  mode: OrderWorksheetProps["mode"];
  onRemarksChange?: OrderWorksheetProps["onRemarksChange"];
}) {
  if (mode !== "create") return <RemarkText value={row.remarks} />;
  return (
    <WorksheetLineNote
      value={row.remarks}
      disabled={!row.requestable && row.requestedQty < 1}
      placeholder="Optional"
      label={`Requester remarks for ${row.skuCode}`}
      onChange={(value: string) => onRemarksChange?.(row.modelId, value)}
    />
  );
}

function SpRemarksCell({
  row,
  editable,
  onSpRemarksChange,
}: {
  row: ProjectedWorksheetLine;
  editable: boolean;
  onSpRemarksChange?: OrderWorksheetProps["onSpRemarksChange"];
}) {
  const approvalLocked = row.requestedQty < 1;
  if (!editable) return <RemarkText value={row.spRemarks} />;
  return (
    <WorksheetLineNote
      value={row.spRemarks}
      disabled={approvalLocked}
      placeholder={approvalLocked ? "No request" : "Optional"}
      label={`SP remarks for ${row.skuCode}`}
      title={approvalLocked ? "SP remarks apply only to lines with a requested quantity." : undefined}
      onChange={(value: string) => onSpRemarksChange?.(row.modelId, value)}
    />
  );
}

function WorksheetFilters({
  filter,
  brands,
  onChange,
  action,
}: {
  filter: WorksheetLineFilter;
  brands: OrderAnalyticsBrand[];
  onChange: (next: WorksheetLineFilter) => void;
  action?: ReactNode;
}) {
  const searchId = useId();
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-muted/20 px-3 py-2">
      <Input
        id={searchId}
        aria-label="Search model code or name"
        value={filter.modelSearch}
        placeholder="Search model code or name"
        className="h-8 w-full min-w-0 bg-card sm:w-64"
        onChange={(event) => onChange({ ...filter, modelSearch: event.target.value })}
      />
      {brands.length > 0 ? (
        <SearchableSelect
          className="w-full sm:w-52"
          popoverClassName="z-[100]"
          options={brands.map((brand) => ({ id: brand.id, label: brand.name }))}
          value={filter.brandId}
          onChange={(brandId) => onChange({ ...filter, brandId })}
          allowClear
          placeholder="All brands"
          searchPlaceholder="Search brands…"
        />
      ) : null}
      <label className="flex h-8 items-center gap-2 px-1 text-sm whitespace-nowrap text-muted-foreground">
        <Checkbox
          checked={filter.orderedOnly}
          onCheckedChange={(checked) => onChange({ ...filter, orderedOnly: checked === true })}
        />
        With a quantity
      </label>
      {action ? <div className="ml-auto shrink-0">{action}</div> : null}
    </div>
  );
}

function WorksheetSummary({
  mode,
  summaryMode,
  summary,
  snapshot,
  snapshotAtLabel,
  totals,
  showApprovedQty,
}: {
  mode: OrderWorksheetProps["mode"];
  summaryMode: OrderWorksheetProps["summaryMode"];
  summary: OrderWorksheetSummary | null;
  snapshot: OrderReviewSnapshot | null;
  snapshotAtLabel: string | null;
  totals: ReturnType<typeof worksheetOrderTotals>;
  showApprovedQty: boolean;
}) {
  if (summaryMode === "missing-snapshot") {
    return (
      <div className="space-y-1">
        <SummaryStrip
          dii={{ value: "N/A", hint: null }}
          stockValue="N/A"
          stockHint={null}
          totals={totals}
          showApprovedQty={showApprovedQty}
          compact
        />
        <p className="text-sm text-muted-foreground">{APPROVED_BEFORE_REVIEW_RECORD}</p>
      </div>
    );
  }

  const source = summaryMode === "snapshot" ? snapshot : summary;
  if (!source) {
    return <p className="text-sm text-muted-foreground">Loading worksheet summary…</p>;
  }

  const diiBase = formatDii(source.computedDii, source.diiUnavailableReason, source.salesUnavailable);
  const counted = formatAsOf(source.inventoryAsOf);
  const sentence = summarySentence(mode, summaryMode, snapshotAtLabel);
  const countedHint = counted === "N/A" ? null : `Counted ${counted}`;

  return (
    <div className="space-y-1">
      <SummaryStrip
        dii={{
          value: diiBase.value,
          hint: diiBase.hint ?? plainSalesPeriod(source.salesPeriodLabel),
        }}
        stockValue={formatPeso(source.inventoryAmount)}
        stockHint={countedHint}
        totals={totals}
        showApprovedQty={showApprovedQty}
        compact
      />
      {sentence ? (
        <p className={cn("text-muted-foreground", mode === "create" ? "text-sm" : "text-xs")}>
          {sentence}
        </p>
      ) : null}
    </div>
  );
}

function summarySentence(
  mode: OrderWorksheetProps["mode"],
  summaryMode: OrderWorksheetProps["summaryMode"],
  snapshotAtLabel: string | null,
): string | null {
  if (summaryMode === "snapshot") {
    return snapshotAtLabel
      ? `These totals were saved when the order was approved on ${snapshotAtLabel}. Stock in the list is today's count.`
      : "These totals were saved when the order was approved. Stock in the list is today's count.";
  }
  switch (mode) {
    case "create":
    case "review":
    case "view":
      return "Stock in this list is what the branch has today.";
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

function SummaryStrip({
  dii,
  stockValue,
  stockHint,
  totals,
  showApprovedQty,
  fullFigures = false,
  compact = false,
}: {
  dii?: { value: string; hint: string | null };
  stockValue?: string;
  stockHint?: string | null;
  totals: ReturnType<typeof worksheetOrderTotals>;
  showApprovedQty: boolean;
  fullFigures?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={
        fullFigures
          ? "flex flex-wrap items-start gap-x-10 gap-y-4"
          : compact
            ? "flex flex-wrap items-start gap-x-6 gap-y-3"
            : cn(
                "grid items-start gap-x-8 gap-y-3",
                showApprovedQty ? "grid-cols-2 sm:grid-cols-3 xl:grid-cols-5" : "grid-cols-2 sm:grid-cols-4",
              )
      }
    >
      {dii ? (
        <SummaryStat label="DII" value={dii.value} hint={dii.hint} full={fullFigures} compact={compact} />
      ) : null}
      {stockValue ? (
        <SummaryStat
          label={fullFigures ? "Stock value at selling price" : "Stock value"}
          value={stockValue}
          hint={stockHint}
          full={fullFigures}
          compact={compact}
        />
      ) : null}
      <SummaryStat
        label="Requested"
        value={formatPeso(totals.requestedAmount)}
        full={fullFigures}
        compact={compact}
      />
      <SummaryStat
        label="Total CBM"
        value={formatWorksheetCbm(totals.requestedCbm)}
        full={fullFigures}
        compact={compact}
      />
      {showApprovedQty ? (
        <SummaryStat
          label="Approved"
          value={formatPeso(totals.approvedAmount)}
          hint={`CBM ${totals.approvedCbm.toFixed(4)}`}
          full={fullFigures}
          compact={compact}
        />
      ) : null}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  hint,
  full = false,
  compact = false,
}: {
  label: string;
  value: string;
  hint?: string | null;
  full?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={full || compact ? "shrink-0" : "min-w-0"}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "font-semibold tabular-nums tracking-tight",
          compact ? "whitespace-nowrap text-base" : "text-2xl",
          full && "whitespace-nowrap",
          !full && !compact && "truncate",
        )}
        title={full || compact ? undefined : value}
      >
        {value}
      </p>
      {hint ? (
        <p
          className={cn(
            "text-xs text-muted-foreground",
            compact && "max-w-44 whitespace-normal leading-snug",
            full && "whitespace-normal",
            !full && !compact && "truncate",
          )}
          title={full || compact ? undefined : hint}
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function RemarkText({ value }: { value: string }) {
  const trimmed = value.trim();
  if (!trimmed) return <span className="text-muted-foreground">—</span>;
  return <p className="break-words whitespace-pre-wrap font-normal">{trimmed}</p>;
}

function shelfSuggestionCaption(row: ProjectedWorksheetLine): string {
  const shelf = row.shelfMax == null ? "no shelf max" : `shelf max ${formatQty(row.shelfMax)}`;
  const formula = `Suggestion uses ${shelf} minus units on hand. Incoming and open orders are not subtracted.`;
  if (row.sugQty != null) return formula;
  const why =
    row.suggestionUnavailableReason === OFF_PLANOGRAM_SUGGESTION_REASON
      ? "This model is not on the shelf plan."
      : (row.suggestionUnavailableReason ?? "No suggestion for this model.");
  return `${why} ${formula}`;
}

function suggestionCaption(row: ProjectedWorksheetLine, orderType: BranchOrderType): string {
  switch (orderType) {
    case "auto_replenish":
      if (row.suggestionUnavailableReason === NO_PLANNING_SUGGESTION_MESSAGE) {
        return NO_PLANNING_SUGGESTION_MESSAGE;
      }
      return "This comes from the released plan. It is the remaining Drop 1 after quantities already on a draft or order.";
    case "manual":
    case "special":
      return shelfSuggestionCaption(row);
    default: {
      const _exhaustive: never = orderType;
      return _exhaustive;
    }
  }
}

function formatQty(value: number): string {
  return value.toLocaleString();
}

function formatCount(value: number | null, unavailable: boolean): string {
  if (unavailable || value == null) return "N/A";
  return formatQty(value);
}

function formatDii(
  computed: number | null,
  reason: string | null,
  salesUnavailable: boolean,
): { value: string; hint: string | null } {
  if (salesUnavailable) {
    return { value: "N/A", hint: "Sales are unavailable for this period." };
  }
  if (computed == null || !Number.isFinite(computed)) {
    return { value: "N/A", hint: reason };
  }
  return { value: computed.toFixed(1), hint: null };
}

function plainSalesPeriod(label: string): string | null {
  const plain = label.replace(/\s*\([^)]*\)\s*$/, "").trim();
  return plain.length > 0 ? plain : null;
}

function formatAsOf(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function WorksheetSkeleton({
  showApproved,
  showSpRemarks,
}: {
  showApproved: boolean;
  showSpRemarks: boolean;
}) {
  return (
    <div
      aria-busy="true"
      aria-label="Loading order worksheet"
      className="space-y-2 p-3"
    >
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex gap-2">
          <Skeleton className="h-8 flex-1" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
          {showApproved ? <Skeleton className="h-8 w-20" /> : null}
          {showSpRemarks ? <Skeleton className="h-8 w-28" /> : null}
        </div>
      ))}
    </div>
  );
}
