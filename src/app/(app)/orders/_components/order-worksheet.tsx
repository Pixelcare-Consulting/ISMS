"use client";

import { useTable } from "@tanstack/react-table";
import type { BranchOrderType } from "@prisma/client";
import { CircleHelp, Trash2 } from "lucide-react";
import { createContext, useContext, useId, useMemo, useState, type ReactNode } from "react";

import { InventoryStatusChips } from "@/app/(app)/orders/_components/inventory-status-chips";
import { WorksheetModelLabel } from "@/app/(app)/orders/_components/worksheet-model-label";
import { TablePagination } from "@/components/data-table/table-pagination";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
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
  planogramBrandOptions,
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
  worksheetBrandSalesQty,
  worksheetModelRate,
  type WorksheetPlanningFigures,
} from "@/features/orders/lib/order-worksheet";
import {
  formatWorksheetCbm,
  NO_PLANNING_SUGGESTION_MESSAGE,
  worksheetLineCbm,
} from "@/features/orders/lib/order-worksheet-metrics";
import { displayModelName } from "@/features/orders/lib/worksheet-model-display";
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
import { parseQtyInput, qtyInputValue } from "@/features/orders/lib/qty-input";
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
  skuCode: "Model code on this order.",
  inventory:
    "Units at the branch by status. On-hand stock is always shown. Other statuses appear when the branch has them.",
  sales: "Units sold this month, up to today.",
  rate: "This model's sales this month divided by that brand's sales this month.",
  milQty: "Shelf maximum for this model.",
  order: "Quantity the branch asked for.",
  spCbm: "Cubic meters for the quantity asked for. This is the model's CBM times that quantity.",
} as const;

export type OrderWorksheetColumnSet = "default" | "supply-planning";

const EMPTY_BRAND_SALES = new Map<string, number | null>();

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
  /** Page layout renders DII, stock, and totals in the side card instead. */
  hideSummary?: boolean;
  /**
   * Supply Planning review uses the order-sheet columns.
   * Create, Team Leader review, and history stay on the default columns.
   */
  columnSet?: OrderWorksheetColumnSet;
  /**
   * When set, the brand filter belongs to the parent.
   * Supply Planning keeps it on the left rail. An empty string is all brands.
   */
  brandId?: string;
  /** Month-to-date sales by brand, used for the rate column. Not stored on the line. */
  brandSalesQty?: ReadonlyMap<string, number | null>;
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
  hideSummary = false,
  columnSet = "default",
  brandId: controlledBrandId,
  brandSalesQty = EMPTY_BRAND_SALES,
}: OrderWorksheetProps) {
  const [filter, setFilter] = useState<WorksheetLineFilter>(EMPTY_WORKSHEET_LINE_FILTER);
  const [page, setPage] = useState(1);
  const brandControlled = controlledBrandId !== undefined;
  const brandId = brandControlled ? controlledBrandId : filter.brandId;
  const appliedFilter = useMemo(
    () => ({ ...filter, brandId }),
    [brandId, filter],
  );
  const projectionMode = mode === "create" ? "create" : "readonly";
  const storedRows = useMemo(
    () => projectWorksheetLines(lines, drafts, orderType, projectionMode),
    [lines, drafts, orderType, projectionMode],
  );
  const visibleRows = useMemo(
    () => visibleWorksheetLines(storedRows, appliedFilter),
    [appliedFilter, storedRows],
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
  const loadedBrandSalesQty = useMemo(() => worksheetBrandSalesQty(lines), [lines]);
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
      columnSet,
      brandSalesQty,
    }),
    [
      approvedQtyEditable,
      brandSalesQty,
      columnSet,
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
  const createBrands = useMemo(
    () => (mode === "create" ? planogramBrandOptions(brands, lines) : brands),
    [brands, lines, mode],
  );
  if (
    mode === "create" &&
    filter.brandId &&
    !createBrands.some((brand) => brand.id === filter.brandId)
  ) {
    setFilter((current) => (current.brandId ? { ...current, brandId: "" } : current));
  }
  const columns = useMemo(
    () =>
      worksheetColumns({
        mode,
        orderType,
        showApprovedQty,
        showSpRemarks,
        columnSet,
      }),
    [columnSet, mode, orderType, showApprovedQty, showSpRemarks],
  );

  if (mode === "create") {
    return (
      <CreateOrderLineList
        brands={createBrands}
        filter={filter}
        onFilterChange={(next) => {
          setFilter(next);
          setPage(1);
        }}
        loading={loading}
        error={error ?? null}
        lineCount={lines.length}
        visibleCount={visibleRows.length}
        rows={pageSlice.rows}
        indexOffset={pageSlice.indexOffset}
        page={pageSlice.page}
        totalPages={pageSlice.totalPages}
        total={pageSlice.total}
        footerLabel={worksheetTotalsLabel(requestedFooter.lineCount, requestedFooter.quantity)}
        onPageChange={setPage}
        orderType={orderType}
        onRequestedQtyChange={onRequestedQtyChange}
        onRemarksChange={onRemarksChange}
        onRemoveAdditional={onRemoveAdditional}
        brandSalesQty={loadedBrandSalesQty}
        filterAction={filterAction}
        summary={summary}
        summaryMode={summaryMode}
        snapshot={snapshot}
        snapshotAtLabel={snapshotAtLabel}
        totals={totals}
        showApprovedQty={showApprovedQty}
        hideSummary={hideSummary}
        footer={footer}
      />
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      {hideSummary ? null : (
        <WorksheetSummary
          mode={mode}
          summaryMode={summaryMode}
          summary={summary}
          snapshot={snapshot}
          snapshotAtLabel={snapshotAtLabel}
          totals={totals}
          showApprovedQty={showApprovedQty}
        />
      )}
      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
        <WorksheetFilters
          filter={appliedFilter}
          brands={brands}
          hideBrandFilter={columnSet === "supply-planning"}
          onChange={(next) => {
            setFilter(brandControlled ? { ...next, brandId: "" } : next);
            setPage(1);
          }}
          action={null}
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
            <WorksheetLinesTable
              rows={pageSlice.rows}
              columns={columns}
              minWidth={columnSet === "supply-planning" ? "72rem" : undefined}
            />
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

function CreateOrderLineList({
  brands,
  filter,
  onFilterChange,
  loading,
  error,
  lineCount,
  visibleCount,
  rows,
  indexOffset,
  page,
  totalPages,
  total,
  footerLabel,
  onPageChange,
  orderType,
  onRequestedQtyChange,
  onRemarksChange,
  onRemoveAdditional,
  brandSalesQty,
  filterAction,
  summary,
  summaryMode,
  snapshot,
  snapshotAtLabel,
  totals,
  showApprovedQty,
  hideSummary,
  footer,
}: {
  brands: OrderAnalyticsBrand[];
  filter: WorksheetLineFilter;
  onFilterChange: (next: WorksheetLineFilter) => void;
  loading: boolean;
  error: string | null;
  lineCount: number;
  visibleCount: number;
  rows: ProjectedWorksheetLine[];
  /** 0-based start of this page in the filtered list. */
  indexOffset: number;
  page: number;
  totalPages: number;
  total: number;
  footerLabel: string;
  onPageChange: (page: number) => void;
  orderType: BranchOrderType;
  onRequestedQtyChange?: OrderWorksheetProps["onRequestedQtyChange"];
  onRemarksChange?: OrderWorksheetProps["onRemarksChange"];
  onRemoveAdditional?: OrderWorksheetProps["onRemoveAdditional"];
  /** Month-to-date sales by brand, summed from the lines already loaded. */
  brandSalesQty: ReadonlyMap<string, number | null>;
  filterAction?: ReactNode;
  summary: OrderWorksheetSummary | null;
  summaryMode: OrderWorksheetProps["summaryMode"];
  snapshot: OrderReviewSnapshot | null;
  snapshotAtLabel: string | null;
  totals: ReturnType<typeof worksheetOrderTotals>;
  showApprovedQty: boolean;
  hideSummary: boolean;
  footer?: ReactNode;
}) {
  const canRemove = Boolean(onRemoveAdditional);
  const removableIds = useMemo(
    () => (canRemove ? rows.map((row) => row.modelId) : []),
    [canRemove, rows],
  );
  const [selectionPage, setSelectionPage] = useState(page);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  if (selectionPage !== page) {
    setSelectionPage(page);
    setSelectedIds(new Set());
  }
  const selectedOnPage = removableIds.filter((id) => selectedIds.has(id));
  const allOnPageSelected =
    removableIds.length > 0 && selectedOnPage.length === removableIds.length;
  const headerChecked: boolean | "indeterminate" =
    allOnPageSelected || (selectedOnPage.length > 0 ? "indeterminate" : false);

  function togglePage(checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of removableIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function toggleRow(modelId: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(modelId);
      else next.delete(modelId);
      return next;
    });
  }

  function removeSelected() {
    if (!onRemoveAdditional || selectedOnPage.length === 0) return;
    for (const id of selectedOnPage) onRemoveAdditional(id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of selectedOnPage) next.delete(id);
      return next;
    });
  }

  const removeSelectedAction =
    selectedOnPage.length > 0 ? (
      <Button type="button" variant="destructive" size="sm" className="h-8" onClick={removeSelected}>
        Remove selected
      </Button>
    ) : null;

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-4">
      {hideSummary ? null : (
        <WorksheetSummary
          mode="create"
          summaryMode={summaryMode}
          summary={summary}
          snapshot={snapshot}
          snapshotAtLabel={snapshotAtLabel}
          totals={totals}
          showApprovedQty={showApprovedQty}
        />
      )}
      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-col">
        <CreateLineToolbar
          filter={filter}
          brands={brands}
          loading={loading}
          onChange={onFilterChange}
          action={
            removeSelectedAction || filterAction ? (
              <>
                {removeSelectedAction}
                {filterAction}
              </>
            ) : undefined
          }
        />
        {loading && lineCount === 0 ? (
          <div className="min-w-0 overflow-x-auto">
            <CreateLineHeader
              showSelection={canRemove}
              checked={false}
              selectionDisabled
              onToggleAll={togglePage}
            />
            <CreateLinesSkeleton />
          </div>
        ) : visibleCount === 0 ? (
          <p className="py-8 text-sm text-muted-foreground">
            {lineCount === 0 ? "This branch has no models to order yet." : "No models match."}
          </p>
        ) : (
          <>
            <div className="min-w-0 overflow-x-auto">
              <CreateLineHeader
                showSelection={canRemove}
                checked={headerChecked}
                selectionDisabled={removableIds.length === 0}
                onToggleAll={togglePage}
              />
              <ul className="divide-y divide-border/60" aria-label="Models">
                  {rows.map((row, index) => (
                    <CreateModelRow
                      key={row.modelId}
                      row={row}
                      indexNo={indexOffset + index + 1}
                      orderType={orderType}
                      canRemove={canRemove}
                      selected={selectedIds.has(row.modelId)}
                      onSelectedChange={(checked) => toggleRow(row.modelId, checked)}
                      onRequestedQtyChange={onRequestedQtyChange}
                      onRemarksChange={onRemarksChange}
                      onRemoveAdditional={onRemoveAdditional}
                      brandSalesQty={brandSalesQty}
                    />
                  ))}
              </ul>
            </div>
            <div className="shrink-0">
              <TablePagination
                page={page}
                totalPages={totalPages}
                total={total}
                label="model"
                summary={footerLabel}
                onPageChange={onPageChange}
              />
            </div>
          </>
        )}
      </div>
      {footer ? <div className="shrink-0">{footer}</div> : null}
    </div>
  );
}

/**
 * One dense row that stays inside the page width.
 * The model name takes leftover space and wraps. Other columns can shrink.
 * Order: No., checkbox, Model, Stock, Sales, Rate, Shelf max, Suggest, Qty, Note, CBM, Details, Remove.
 */
const CREATE_LINE_GRID =
  "grid w-full min-w-0 items-center gap-x-1 sm:gap-x-2 [grid-template-columns:1.5rem_1.25rem_minmax(4.5rem,1.8fr)_minmax(2.25rem,0.5fr)_minmax(0,0.55fr)_minmax(3.25rem,0.8fr)_minmax(0,0.65fr)_minmax(3rem,0.75fr)_minmax(2.25rem,0.72fr)_minmax(0,0.5fr)_minmax(2.75rem,0.7fr)_minmax(0,0.6fr)_1.5rem] [&>*]:min-w-0";

function CreateLineHeader({
  showSelection,
  checked,
  selectionDisabled,
  onToggleAll,
}: {
  showSelection: boolean;
  checked: boolean | "indeterminate";
  selectionDisabled: boolean;
  onToggleAll: (checked: boolean) => void;
}) {
  return (
    <div
      className={cn(
        CREATE_LINE_GRID,
        "sticky top-0 z-10 border-b border-border/70 bg-card pb-2 text-xs whitespace-normal text-muted-foreground",
      )}
    >
      <span className="text-center">No.</span>
      {showSelection ? (
        <Checkbox
          className="justify-self-center"
          checked={checked}
          disabled={selectionDisabled}
          onCheckedChange={(value) => onToggleAll(value === true)}
          aria-label="Select all models on this page"
        />
      ) : (
        <span />
      )}
      <span>Model</span>
      <span className="text-right">Stock</span>
      <span className="text-right">Sales</span>
      <span className="text-right">Rate</span>
      <span className="text-right">Shelf max</span>
      <span className="text-right">Suggest</span>
      <span className="text-center">Qty</span>
      <span className="sr-only">Note</span>
      <span className="text-right">CBM</span>
      <span className="sr-only">Details</span>
      <span className="sr-only">Remove</span>
    </div>
  );
}

function CreateLineToolbar({
  filter,
  brands,
  loading = false,
  onChange,
  action,
}: {
  filter: WorksheetLineFilter;
  brands: OrderAnalyticsBrand[];
  loading?: boolean;
  onChange: (next: WorksheetLineFilter) => void;
  action?: ReactNode;
}) {
  const searchId = useId();
  const showBrandFilter = brands.length > 0 || loading;
  return (
    <div className="flex shrink-0 flex-col gap-2 py-1.5 sm:flex-row sm:flex-wrap sm:items-center">
      <Input
        id={searchId}
        aria-label="Search model code or name"
        value={filter.modelSearch}
        placeholder="Search model code or name"
        className="h-9 w-full min-w-0 flex-1 rounded-lg border-transparent bg-muted/70 shadow-none sm:max-w-md"
        onChange={(event) => onChange({ ...filter, modelSearch: event.target.value })}
      />
      {showBrandFilter ? (
        <SearchableSelect
          className="w-full sm:w-52"
          popoverClassName="z-[100]"
          options={brands.map((brand) => ({ id: brand.id, label: brand.name }))}
          value={filter.brandId}
          onChange={(brandId) => onChange({ ...filter, brandId })}
          allowClear
          disabled={brands.length === 0}
          placeholder="All brands"
          searchPlaceholder="Search brands…"
          emptyMessage="No brands on this planogram."
        />
      ) : null}
      <label className="flex h-9 shrink-0 items-center gap-2 text-sm whitespace-nowrap text-muted-foreground">
        <Checkbox
          checked={filter.orderedOnly}
          onCheckedChange={(checked) => onChange({ ...filter, orderedOnly: checked === true })}
        />
        With a quantity
      </label>
      {action ? <div className="flex shrink-0 items-center gap-2 sm:ml-auto">{action}</div> : null}
    </div>
  );
}

function CreateLinesSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading models" className="divide-y divide-border/60">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className={cn(CREATE_LINE_GRID, "py-2.5")}>
          <Skeleton className="mx-auto h-4 w-4" />
          <Skeleton className="mx-auto size-4 rounded-sm" />
          <div className="min-w-0 space-y-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-44 max-w-full" />
          </div>
          <Skeleton className="ml-auto h-4 w-6" />
          <Skeleton className="ml-auto h-4 w-6" />
          <Skeleton className="ml-auto h-4 w-8" />
          <Skeleton className="ml-auto h-4 w-8" />
          <Skeleton className="ml-auto h-4 w-6" />
          <Skeleton className="mx-auto h-8 w-16 rounded-lg" />
          <span />
          <Skeleton className="ml-auto h-4 w-12" />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

function formatCreateSalesQty(row: ProjectedWorksheetLine): string {
  if (row.salesUnavailable || row.salesQty == null) return "—";
  return formatQty(row.salesQty);
}

/** Model month-to-date sales divided by that brand's month-to-date sales. */
function formatCreateModelRate(
  row: ProjectedWorksheetLine,
  brandSalesQty: ReadonlyMap<string, number | null>,
): string {
  const rate = worksheetModelRate(
    row.salesQty,
    row.salesUnavailable,
    brandSalesQty.get(row.brandId ?? "") ?? null,
  );
  if (rate == null) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

function CreateModelRow({
  row,
  indexNo,
  orderType,
  canRemove,
  selected,
  onSelectedChange,
  onRequestedQtyChange,
  onRemarksChange,
  onRemoveAdditional,
  brandSalesQty,
}: {
  row: ProjectedWorksheetLine;
  indexNo: number;
  orderType: BranchOrderType;
  canRemove: boolean;
  selected: boolean;
  onSelectedChange: (checked: boolean) => void;
  onRequestedQtyChange?: OrderWorksheetProps["onRequestedQtyChange"];
  onRemarksChange?: OrderWorksheetProps["onRemarksChange"];
  onRemoveAdditional?: OrderWorksheetProps["onRemoveAdditional"];
  brandSalesQty: ReadonlyMap<string, number | null>;
}) {
  const modelName = displayModelName(row.skuCode, row.name);
  const shelfMax = row.shelfMax == null ? "—" : formatQty(row.shelfMax);
  const sales = formatCreateSalesQty(row);
  const rate = formatCreateModelRate(row, brandSalesQty);
  const lineCbm = formatWorksheetCbm(worksheetLineCbm(row.requestedQty, row.cbm));

  return (
    <li className={cn(CREATE_LINE_GRID, "py-2.5")}>
      <span className="text-center text-sm tabular-nums text-muted-foreground">{indexNo}</span>
      {canRemove ? (
        <Checkbox
          className="justify-self-center"
          checked={selected}
          onCheckedChange={(value) => onSelectedChange(value === true)}
          aria-label={`Select ${row.skuCode}`}
        />
      ) : (
        <span />
      )}
      <div className="min-w-0">
        <p className="break-words font-medium leading-5">{row.skuCode}</p>
        {modelName ? (
          <p className="break-words text-sm leading-5 text-muted-foreground">{modelName}</p>
        ) : null}
      </div>
      <p
        className="truncate text-right text-sm tabular-nums"
        title={stockHoverTitle(row.inventory)}
      >
        {formatQty(row.inventory.onHandQty)}
      </p>
      <p
        className="truncate text-right text-sm tabular-nums"
        title={WORKSHEET_COLUMN_HELP.sales}
      >
        {sales}
      </p>
      <p
        className="truncate text-right text-sm tabular-nums"
        title={WORKSHEET_COLUMN_HELP.rate}
      >
        {rate}
      </p>
      <p className="truncate text-right text-sm tabular-nums" title={suggestHelp(orderType)}>
        {shelfMax}
      </p>
      <p
        className="truncate text-right text-sm tabular-nums"
        title={suggestionCaption(row, orderType)}
      >
        {formatSuggestValue(row, orderType)}
      </p>
      <RequestedCell
        row={row}
        mode="create"
        orderType={orderType}
        onRequestedQtyChange={onRequestedQtyChange}
        column
      />
      <CreateLineNote row={row} onRemarksChange={onRemarksChange} />
      <p
        className="truncate text-right text-sm tabular-nums text-foreground"
        title={WORKSHEET_COLUMN_HELP.cbm}
      >
        {lineCbm}
      </p>
      <LineDetails row={row} orderType={orderType} />
      {onRemoveAdditional ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 max-w-full justify-self-end text-muted-foreground hover:text-foreground"
          onClick={() => onRemoveAdditional(row.modelId)}
          aria-label={`Remove line ${row.skuCode}`}
        >
          <Trash2 className="size-4" />
        </Button>
      ) : (
        <span />
      )}
    </li>
  );
}

function LineNotePopover({
  skuCode,
  value,
  buttonLabel,
  label,
  help,
  placeholder = "Optional",
  triggerDisabled = false,
  fieldDisabled = false,
  lockedTitle,
  buttonClassName,
  onChange,
}: {
  skuCode: string;
  value: string;
  buttonLabel: string;
  label: string;
  help: string;
  placeholder?: string;
  /** Line cannot take a note, so the button stays closed. */
  triggerDisabled?: boolean;
  /** Note stays visible inside the popover, but cannot be edited. */
  fieldDisabled?: boolean;
  lockedTitle?: string;
  buttonClassName?: string;
  onChange?: (value: string) => void;
}) {
  const trimmed = value.trim();
  const hasNote = trimmed.length > 0;
  return (
    <Popover modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={triggerDisabled}
          className={cn(
            "h-7 px-2 text-xs font-normal",
            hasNote ? "text-primary" : "text-muted-foreground",
            buttonClassName,
          )}
          aria-label={label}
          title={lockedTitle ?? (hasNote ? trimmed : help)}
        >
          {buttonLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" collisionPadding={16} className="z-[100] w-72 space-y-2 p-3">
        <div>
          <p className="text-sm font-medium">{buttonLabel}</p>
          <p className="text-xs text-muted-foreground">{skuCode}</p>
        </div>
        <Textarea
          value={value}
          disabled={fieldDisabled || onChange == null}
          placeholder={onChange ? placeholder : "—"}
          rows={3}
          aria-label={label}
          title={lockedTitle}
          className="min-h-20 resize-none rounded-lg border-transparent bg-muted/70 shadow-none"
          onChange={(event) => onChange?.(event.target.value)}
        />
      </PopoverContent>
    </Popover>
  );
}

function CreateLineNote({
  row,
  onRemarksChange,
}: {
  row: ProjectedWorksheetLine;
  onRemarksChange?: OrderWorksheetProps["onRemarksChange"];
}) {
  const disabled = !row.requestable && row.requestedQty < 1;
  return (
    <LineNotePopover
      skuCode={row.skuCode}
      value={row.remarks}
      buttonLabel="Note"
      label={`Requester remarks for ${row.skuCode}`}
      help={WORKSHEET_COLUMN_HELP.note}
      placeholder="Optional"
      triggerDisabled={disabled}
      fieldDisabled={disabled}
      buttonClassName="max-w-full min-w-0 justify-self-end px-1"
      onChange={(value) => onRemarksChange?.(row.modelId, value)}
    />
  );
}

function formatSuggestValue(row: ProjectedWorksheetLine, orderType: BranchOrderType): string {
  if (
    orderType === "auto_replenish" &&
    row.suggestionUnavailableReason === NO_PLANNING_SUGGESTION_MESSAGE
  ) {
    return NO_PLANNING_SUGGESTION_MESSAGE;
  }
  if (row.sugQty == null) return "—";
  return formatQty(row.sugQty);
}

interface WorksheetGridContextValue {
  mode: OrderWorksheetProps["mode"];
  orderType: BranchOrderType;
  columnSet: OrderWorksheetColumnSet;
  approvedQtyEditable: boolean;
  spRemarksEditable: boolean;
  /** 0-based start of this page in the filtered list. */
  indexOffset: number;
  brandSalesQty: ReadonlyMap<string, number | null>;
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
  columnSet: OrderWorksheetColumnSet;
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
  switch (input.columnSet) {
    case "supply-planning":
      return supplyPlanningColumns(input.orderType);
    case "default":
      return defaultWorksheetColumns(input);
    default: {
      const _exhaustive: never = input.columnSet;
      return _exhaustive;
    }
  }
}

function supplyPlanningColumns(
  orderType: BranchOrderType,
): DataTableColumn<ProjectedWorksheetLine>[] {
  return [
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
      header: () => <WorksheetHeader label="SKU/Model" help={WORKSHEET_COLUMN_HELP.skuCode} />,
      meta: fitColumn("8.5rem", undefined, "top"),
      cell: SkuCodeColumnCell,
    },
    {
      id: "inventory",
      header: () => (
        <WorksheetHeader label="Inventory" help={WORKSHEET_COLUMN_HELP.inventory} />
      ),
      meta: fitColumn("6.5rem", undefined, "top"),
      cell: StackedInventoryColumnCell,
    },
    {
      id: "sales",
      header: () => (
        <WorksheetHeader label="Sales" help={WORKSHEET_COLUMN_HELP.sales} alignEnd />
      ),
      meta: fitColumn("4.5rem", "end"),
      cell: SalesQtyColumnCell,
    },
    {
      id: "rate",
      header: () => <WorksheetHeader label="Rate" help={WORKSHEET_COLUMN_HELP.rate} alignEnd />,
      meta: fitColumn("4.5rem", "end"),
      cell: RateColumnCell,
    },
    {
      id: "mil",
      header: () => (
        <WorksheetHeader label="MIL qty" help={WORKSHEET_COLUMN_HELP.milQty} alignEnd />
      ),
      meta: fitColumn("4.75rem", "end"),
      cell: MilQtyColumnCell,
    },
    {
      id: "sug",
      header: () => (
        <WorksheetHeader label="Suggested qty" help={suggestHelp(orderType)} alignEnd />
      ),
      meta: fitColumn("6.5rem", "end"),
      cell: SuggestedQtyColumnCell,
    },
    {
      id: "requested",
      header: () => <WorksheetHeader label="Order" help={WORKSHEET_COLUMN_HELP.order} alignEnd />,
      meta: fitColumn("4.5rem", "end"),
      cell: RequestedColumnCell,
    },
    {
      id: "remarks",
      header: () => <WorksheetHeader label="Remarks" help={WORKSHEET_COLUMN_HELP.note} />,
      meta: fitColumn("7rem", undefined, "top"),
      cell: ReadOnlyRemarksColumnCell,
    },
    {
      id: "cbm",
      header: () => <WorksheetHeader label="CBM" help={WORKSHEET_COLUMN_HELP.spCbm} alignEnd />,
      meta: fitColumn("5rem", "end"),
      cell: SupplyPlanningCbmColumnCell,
    },
    {
      id: "approved",
      header: () => (
        <WorksheetHeader label="Approved" help={WORKSHEET_COLUMN_HELP.approved} alignEnd />
      ),
      meta: fitColumn("5.5rem", "end"),
      cell: ApprovedColumnCell,
    },
    {
      id: "spRemarks",
      header: () => <WorksheetHeader label="SP remarks" help={WORKSHEET_COLUMN_HELP.spNote} />,
      meta: fitColumn("7rem"),
      cell: SpRemarksColumnCell,
    },
  ];
}

function defaultWorksheetColumns(input: WorksheetColumnInput): DataTableColumn<ProjectedWorksheetLine>[] {
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

function SkuCodeColumnCell({ row }: WorksheetBodyCellProps) {
  return <p className="break-words font-medium">{row.original.skuCode}</p>;
}

function StackedInventoryColumnCell({ row }: WorksheetBodyCellProps) {
  return <InventoryStatusChips inventory={row.original.inventory.byStatus} stacked />;
}

function SalesQtyColumnCell({ row }: WorksheetBodyCellProps) {
  const line = row.original;
  if (line.salesUnavailable || line.salesQty == null) {
    return <span className="text-muted-foreground">N/A</span>;
  }
  return <span>{formatQty(line.salesQty)}</span>;
}

function RateColumnCell({ row }: WorksheetBodyCellProps) {
  const { brandSalesQty } = useWorksheetGrid();
  const line = row.original;
  const rate = worksheetModelRate(
    line.salesQty,
    line.salesUnavailable,
    brandSalesQty.get(line.brandId ?? "") ?? null,
  );
  if (rate == null) return <span className="text-muted-foreground">—</span>;
  return <span>{`${(rate * 100).toFixed(1)}%`}</span>;
}

function MilQtyColumnCell({ row }: WorksheetBodyCellProps) {
  const shelfMax = row.original.shelfMax;
  if (shelfMax == null) return <span className="text-muted-foreground">—</span>;
  return <span>{formatQty(shelfMax)}</span>;
}

function SuggestedQtyColumnCell({ row }: WorksheetBodyCellProps) {
  const { orderType } = useWorksheetGrid();
  return (
    <span title={suggestionCaption(row.original, orderType)}>
      {formatSuggestValue(row.original, orderType)}
    </span>
  );
}

function ReadOnlyRemarksColumnCell({ row }: WorksheetBodyCellProps) {
  return <RemarkText value={row.original.remarks} />;
}

function SupplyPlanningCbmColumnCell({ row }: WorksheetBodyCellProps) {
  const quantity = row.original.requestedQty;
  const unit = Number.isFinite(row.original.cbm) ? row.original.cbm : 0;
  const total = Number.isFinite(quantity) && quantity > 0 ? quantity * unit : 0;
  return <>{formatWorksheetCbm(total)}</>;
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
  const { columnSet, spRemarksEditable, onSpRemarksChange } = useWorksheetGrid();
  const buttonLabel = columnSet === "supply-planning" ? "SP remarks" : "SP note";
  return (
    <SpRemarksCell
      row={row.original}
      editable={spRemarksEditable}
      buttonLabel={buttonLabel}
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
  minWidth,
}: {
  rows: ProjectedWorksheetLine[];
  columns: DataTableColumn<ProjectedWorksheetLine>[];
  minWidth?: string;
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
        <div
          className={cn(
            "min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain",
            minWidth ? "overflow-x-auto" : "overflow-x-hidden",
          )}
        >
          <table
            className="w-full table-fixed caption-bottom text-sm"
            style={minWidth ? { minWidth } : undefined}
          >
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
          className="h-7 max-w-full min-w-0 justify-self-end px-1 text-xs font-normal text-muted-foreground"
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
  prominent = false,
  column = false,
}: {
  row: ProjectedWorksheetLine;
  mode: OrderWorksheetProps["mode"];
  orderType: BranchOrderType;
  onRequestedQtyChange?: OrderWorksheetProps["onRequestedQtyChange"];
  /** Larger quantity field. The review table keeps the compact field. */
  prominent?: boolean;
  /** Create-mode column: a short field centered under Qty. */
  column?: boolean;
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
      className={cn(
        column
          ? "h-8 w-full min-w-0 max-w-full justify-self-center rounded-lg border-transparent bg-muted px-1 text-center text-sm tabular-nums shadow-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          : prominent
            ? "h-10 w-24 shrink-0 text-center text-base font-medium tabular-nums"
            : "ml-auto h-8 w-full min-w-0 text-right",
        !row.requestable && "bg-muted",
      )}
      value={qtyInputValue(row.requestedQty)}
      placeholder="0"
      inputMode="numeric"
      title={blockedReason}
      aria-label={`Requested quantity for ${row.skuCode}`}
      onChange={(event) => onRequestedQtyChange?.(row.modelId, parseQtyInput(event.target.value))}
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
      value={approvalLocked ? "" : qtyInputValue(row.approvedQty ?? row.requestedQty)}
      placeholder={approvalLocked ? undefined : "0"}
      inputMode="numeric"
      aria-label={`Approved quantity for ${row.skuCode}`}
      title={approvalLocked ? "Approval applies only to lines with a requested quantity." : undefined}
      onChange={(event) => onApprovedQtyChange?.(row.modelId, parseQtyInput(event.target.value))}
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
  switch (mode) {
    case "view":
      return <RemarkText value={row.remarks} />;
    case "review":
      return (
        <LineNotePopover
          skuCode={row.skuCode}
          value={row.remarks}
          buttonLabel="Note"
          label={`Requester remarks for ${row.skuCode}`}
          help={WORKSHEET_COLUMN_HELP.note}
          buttonClassName="whitespace-nowrap"
        />
      );
    case "create":
      return (
        <LineNotePopover
          skuCode={row.skuCode}
          value={row.remarks}
          buttonLabel="Note"
          label={`Requester remarks for ${row.skuCode}`}
          help={WORKSHEET_COLUMN_HELP.note}
          placeholder="Optional"
          triggerDisabled={!row.requestable && row.requestedQty < 1}
          fieldDisabled={!row.requestable && row.requestedQty < 1}
          onChange={(value) => onRemarksChange?.(row.modelId, value)}
        />
      );
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

function SpRemarksCell({
  row,
  editable,
  buttonLabel = "SP note",
  onSpRemarksChange,
}: {
  row: ProjectedWorksheetLine;
  editable: boolean;
  buttonLabel?: string;
  onSpRemarksChange?: OrderWorksheetProps["onSpRemarksChange"];
}) {
  const approvalLocked = row.requestedQty < 1;
  if (!editable) return <RemarkText value={row.spRemarks} />;
  return (
    <LineNotePopover
      skuCode={row.skuCode}
      value={row.spRemarks}
      buttonLabel={buttonLabel}
      label={`SP remarks for ${row.skuCode}`}
      help={WORKSHEET_COLUMN_HELP.spNote}
      placeholder={approvalLocked ? "No request" : "Optional"}
      fieldDisabled={approvalLocked}
      buttonClassName="whitespace-nowrap"
      lockedTitle={
        approvalLocked ? "SP remarks apply only to lines with a requested quantity." : undefined
      }
      onChange={(value) => onSpRemarksChange?.(row.modelId, value)}
    />
  );
}

function WorksheetFilters({
  filter,
  brands,
  hideBrandFilter = false,
  onChange,
  action,
}: {
  filter: WorksheetLineFilter;
  brands: OrderAnalyticsBrand[];
  hideBrandFilter?: boolean;
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
      {hideBrandFilter || brands.length === 0 ? null : (
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
      )}
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

export function SupplyPlanningFigures({
  figures,
  inventoryAsOf,
  loading = false,
}: {
  figures: WorksheetPlanningFigures | null;
  inventoryAsOf: string | null;
  loading?: boolean;
}) {
  if (!figures) {
    return (
      <p className="text-sm text-muted-foreground">
        {loading ? "Loading planning figures…" : "Planning figures appear with the worksheet."}
      </p>
    );
  }

  const dii = formatDii(figures.computedDii, figures.diiUnavailableReason, figures.salesUnavailable);
  const counted = inventoryAsOf ? formatAsOf(inventoryAsOf) : "N/A";
  const countedHint = counted === "N/A" ? null : `Counted ${counted}`;
  const target =
    figures.targetDiiDays == null ? "Target DII —" : `Target DII ${formatTargetDays(figures.targetDiiDays)}`;
  const inventoryHint = [countedHint, target].filter((hint): hint is string => Boolean(hint)).join(" · ");

  const cards: { label: string; value: string; hint: string | null }[] = [
    {
      label: "Branch quota",
      value: figures.quotaQty == null ? "—" : formatQty(figures.quotaQty),
      hint: "This month",
    },
    { label: "DII", value: dii.value, hint: dii.hint },
    {
      label: "Inventory amount",
      value: formatPeso(figures.inventoryAmount),
      hint: inventoryHint,
    },
    {
      label: "Approved order amount",
      value: formatPeso(figures.approvedOrderAmount),
      hint: null,
    },
    {
      label: "Total inventory amount",
      value: formatPeso(figures.totalInventoryAmount),
      hint: null,
    },
    {
      label: "Total CBM",
      value: formatWorksheetCbm(figures.totalCbm),
      hint: null,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => (
        <div key={card.label} className="min-w-0 rounded-lg border bg-card px-3 py-2">
          <p className="text-xs text-muted-foreground">{card.label}</p>
          <p className="truncate text-base font-semibold tabular-nums tracking-tight" title={card.value}>
            {card.value}
          </p>
          {card.hint ? (
            <p className="text-xs leading-snug text-muted-foreground">{card.hint}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function formatTargetDays(days: number): string {
  const rounded = Number.isInteger(days) ? String(days) : days.toFixed(1);
  return `${rounded} days`;
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

export function OrderWorksheetAsideSummary({
  summary,
  totals,
  loading = false,
}: {
  summary: OrderWorksheetSummary | null;
  totals: ReturnType<typeof worksheetOrderTotals>;
  loading?: boolean;
}) {
  if (!summary) {
    return (
      <p className="text-right text-sm text-muted-foreground">
        {loading ? "Loading stock and totals…" : "Stock and totals appear after a branch is selected."}
      </p>
    );
  }

  const dii = formatDii(summary.computedDii, summary.diiUnavailableReason, summary.salesUnavailable);
  const counted = formatAsOf(summary.inventoryAsOf);
  const countedHint = counted === "N/A" ? null : `Counted ${counted}`;
  const diiHint = dii.hint ?? plainSalesPeriod(summary.salesPeriodLabel);
  const sentence = summarySentence("create", "current", null);
  const rows: { label: string; value: string; hint: string | null; strong?: boolean }[] = [
    { label: "DII", value: dii.value, hint: diiHint },
    { label: "Stock value", value: formatPeso(summary.inventoryAmount), hint: countedHint },
    {
      label: "Requested value",
      value: formatPeso(totals.requestedAmount),
      hint: null,
      strong: true,
    },
    { label: "Total CBM", value: formatWorksheetCbm(totals.requestedCbm), hint: null },
  ];

  return (
    <div className="flex justify-end">
      <div className="w-full max-w-sm space-y-3">
        <dl className="space-y-2.5">
          {rows.map((row) => (
            <div key={row.label} className="flex items-start justify-between gap-8">
              <dt
                className={cn(
                  "min-w-0 text-sm",
                  row.strong ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {row.label}
                {row.hint ? (
                  <span className="mt-0.5 block text-xs font-normal leading-snug text-muted-foreground">
                    {row.hint}
                  </span>
                ) : null}
              </dt>
              <dd
                className={cn(
                  "shrink-0 text-right tabular-nums text-foreground",
                  row.strong ? "text-base font-semibold" : "text-sm",
                )}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
        {sentence ? (
          <p className="text-xs leading-relaxed text-muted-foreground">{sentence}</p>
        ) : null}
      </div>
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
