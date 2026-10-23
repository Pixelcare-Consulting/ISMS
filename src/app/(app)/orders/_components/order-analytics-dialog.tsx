"use client";

import type { BranchOrderType } from "@prisma/client";
import { CircleHelp } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";

import { InventoryStatusChips } from "@/app/(app)/orders/_components/inventory-status-chips";
import { WorksheetModelLabel } from "@/app/(app)/orders/_components/worksheet-model-label";
import { TablePagination } from "@/components/data-table/table-pagination";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getOrderAnalyticsAction } from "@/features/orders/actions/order-analytics.actions";
import {
  analyticsLineSuggest,
  analyticsMetricStrip,
  analyticsSuggestHelp,
  type AnalyticsMetricStrip,
} from "@/features/orders/lib/order-analytics-sheet";
import {
  paginateWorksheetLines,
  worksheetTotalsLabel,
  WORKSHEET_PAGE_SIZE,
} from "@/features/orders/lib/order-worksheet-filters";
import type { OrderAnalyticsPayload } from "@/features/orders/types/order-analytics";
import { cn } from "@/utils/cn";
import { formatPeso } from "@/utils/format-currency";

export interface OrderAnalyticsPlanHint {
  qty: number | null;
  unavailable: boolean;
}

const COLUMN_HELP = {
  model: "SKU or model code and name.",
  inventory: "Units at the branch by status, such as stock and in transit.",
  sales: "Units sold this month.",
  rate: "This model's share of this month's sales for the models loaded on this branch.",
  milQty: "Target units for this model. This is the shelf maximum.",
  milAmt: "Target units times the selling price.",
} as const;

export function OrderAnalyticsDialog({
  open,
  onOpenChange,
  branchId,
  branchName,
  orderType,
  planByModel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: string;
  branchName: string;
  orderType: BranchOrderType;
  planByModel: ReadonlyMap<string, OrderAnalyticsPlanHint>;
}) {
  const searchId = useId();
  const [payload, setPayload] = useState<OrderAnalyticsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [modelSearch, setModelSearch] = useState("");
  const [brandId, setBrandId] = useState("");
  const [page, setPage] = useState(1);
  const requestKey = `${branchId}:${orderType}`;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void getOrderAnalyticsAction({
      branchId,
      orderType,
      brandId: null,
      allBrands: true,
    }).then((result) => {
      if (cancelled) return;
      if (result.error || !result.data) {
        setPayload(null);
        setError(result.error ?? "Failed to load order analytics");
        setLoadedKey(requestKey);
        return;
      }
      setError(null);
      setPayload(result.data);
      setLoadedKey(requestKey);
    });
    return () => {
      cancelled = true;
    };
  }, [branchId, open, orderType, requestKey]);

  const ready = loadedKey === requestKey;
  const loading = open && !ready;
  const shown = ready ? payload : null;
  const indexed = useMemo(() => shown?.lines ?? [], [shown]);
  const brandLines = useMemo(
    () => (brandId ? indexed.filter((line) => line.brandId === brandId) : indexed),
    [brandId, indexed],
  );
  const visible = useMemo(() => {
    const search = modelSearch.trim().toLowerCase();
    if (!search) return brandLines;
    return brandLines.filter((line) =>
      `${line.skuCode} ${line.name}`.toLowerCase().includes(search),
    );
  }, [brandLines, modelSearch]);
  const pageSlice = useMemo(
    () => paginateWorksheetLines(visible, page, WORKSHEET_PAGE_SIZE),
    [page, visible],
  );
  const sheetFooter = useMemo(() => {
    let quantity = 0;
    for (const line of visible) quantity += line.salesQty;
    return worksheetTotalsLabel(visible.length, quantity);
  }, [visible]);
  const metrics = useMemo(
    () => analyticsMetricStrip(brandLines, payload?.daysElapsed ?? 1),
    [brandLines, payload?.daysElapsed],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="z-[60]"
        className="z-[60] flex max-h-[calc(100svh-1rem)] w-[calc(100%-1rem)] max-w-[90rem] flex-col gap-0 overflow-hidden p-0 sm:max-w-[90rem] sm:p-0"
      >
        <DialogHeader className="shrink-0 border-b px-4 py-4 sm:px-6">
          <DialogTitle>Order analytics</DialogTitle>
          <DialogDescription className="max-w-3xl">
            Stock, sales, and days of cover for {branchName}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-3 sm:px-6">
          {error ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <AnalyticsMetricRow metrics={metrics} loading={loading} />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-muted/20 px-3 py-2">
              <Input
                id={searchId}
                aria-label="Search model code or name"
                value={modelSearch}
                placeholder="Search model code or name"
                className="h-8 w-full min-w-0 bg-card sm:w-64"
                onChange={(event) => {
                  setModelSearch(event.target.value);
                  setPage(1);
                }}
              />
              {(shown?.brands.length ?? 0) > 0 ? (
                <SearchableSelect
                  className="w-full sm:w-52"
                  popoverClassName="z-[100]"
                  options={(shown?.brands ?? []).map((brand) => ({
                    id: brand.id,
                    label: brand.name,
                  }))}
                  value={brandId}
                  onChange={(next) => {
                    setBrandId(next);
                    setPage(1);
                  }}
                  allowClear
                  placeholder="All brands"
                  searchPlaceholder="Search brands…"
                />
              ) : null}
            </div>
            {loading ? (
              <p className="p-4 text-sm text-muted-foreground">Loading analytics…</p>
            ) : visible.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                {indexed.length === 0
                  ? "This branch has no models on the shelf plan yet."
                  : "No models match."}
              </p>
            ) : (
              <TooltipProvider delayDuration={200}>
                <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
                  <table className="w-full table-fixed caption-bottom text-sm">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <AnalyticsHead
                          label="No."
                          className="w-[2.75rem] whitespace-nowrap px-2"
                        />
                        <AnalyticsHead
                          label="SKU/Model"
                          help={COLUMN_HELP.model}
                          className="w-[calc(28%-2.75rem)]"
                        />
                        <AnalyticsHead label="Inventory" help={COLUMN_HELP.inventory} className="w-[16%]" />
                        <AnalyticsHead label="Sales" help={COLUMN_HELP.sales} alignEnd className="w-[8%]" />
                        <AnalyticsHead label="Rate" help={COLUMN_HELP.rate} alignEnd className="w-[8%]" />
                        <AnalyticsHead label="MIL qty" help={COLUMN_HELP.milQty} alignEnd className="w-[10%]" />
                        <AnalyticsHead label="MIL amount" help={COLUMN_HELP.milAmt} alignEnd className="w-[12%]" />
                        <AnalyticsHead
                          label="Suggest"
                          help={analyticsSuggestHelp(orderType)}
                          alignEnd
                          className="w-[18%]"
                        />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageSlice.rows.map((line, index) => {
                        const plan = planByModel.get(line.modelId);
                        const suggest = analyticsLineSuggest({
                          orderType,
                          shelfGapQty: line.sugQty,
                          planQty: plan?.qty,
                          planUnavailable: orderType === "auto_replenish" && (plan == null || plan.unavailable),
                        });
                        const rowNo = pageSlice.indexOffset + index + 1;
                        return (
                          <TableRow key={line.modelId}>
                            <TableCell className="w-[2.75rem] whitespace-nowrap px-2 py-1.5 align-middle tabular-nums">
                              {rowNo}
                            </TableCell>
                            <TableCell className="overflow-visible px-2 py-1.5 align-top whitespace-normal">
                              <WorksheetModelLabel skuCode={line.skuCode} name={line.name} />
                            </TableCell>
                            <TableCell className="px-3 py-1.5 align-middle">
                              <InventoryStatusChips inventory={line.inventory} />
                            </TableCell>
                            <TableCell className="px-3 py-1.5 text-right align-middle tabular-nums">
                              {line.salesQty.toLocaleString()}
                            </TableCell>
                            <TableCell className="px-3 py-1.5 text-right align-middle tabular-nums">
                              {line.rate != null ? `${(line.rate * 100).toFixed(1)}%` : "—"}
                            </TableCell>
                            <TableCell className="px-3 py-1.5 text-right align-middle tabular-nums">
                              {line.milQty.toLocaleString()}
                            </TableCell>
                            <TableCell className="px-3 py-1.5 text-right align-middle tabular-nums">
                              {formatPeso(line.milAmt)}
                            </TableCell>
                            <TableCell className="px-2 py-1.5 text-right align-middle tabular-nums">
                              {suggest.kind === "qty" ? (
                                <span className="flex w-full min-w-0 flex-col items-end gap-1 leading-tight">
                                  <span>{suggest.qty.toLocaleString()}</span>
                                  <span className="block max-w-full text-right text-[11px] font-normal leading-tight whitespace-normal text-muted-foreground">
                                    Shelf max {line.milQty.toLocaleString()}
                                  </span>
                                </span>
                              ) : (
                                <span className="flex w-full min-w-0 flex-col items-end gap-1 text-right leading-tight">
                                  <span className="text-xs whitespace-normal text-muted-foreground">
                                    {suggest.message}
                                  </span>
                                  <span className="block max-w-full text-right text-[11px] font-normal leading-tight whitespace-normal text-muted-foreground">
                                    Shelf max {line.milQty.toLocaleString()}
                                  </span>
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </table>
                </div>
                <div className="shrink-0">
                  <TablePagination
                    page={pageSlice.page}
                    totalPages={pageSlice.totalPages}
                    total={pageSlice.total}
                    label="model"
                    summary={sheetFooter}
                    onPageChange={setPage}
                  />
                </div>
              </TooltipProvider>
            )}
          </div>
        </div>
        <DialogFooter className="shrink-0 border-t px-4 py-4 sm:px-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AnalyticsMetricRow({
  metrics,
  loading,
}: {
  metrics: AnalyticsMetricStrip;
  loading: boolean;
}) {
  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading analytics…</p>;
  }
  const dii =
    metrics.computedDii == null || !Number.isFinite(metrics.computedDii)
      ? "N/A"
      : metrics.computedDii.toFixed(1);
  return (
    <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
      <AnalyticsStat
        label="DII"
        value={dii}
        hint={
          metrics.computedDii == null
            ? "No sales in this period"
            : metrics.targetDays != null
              ? `Target ${metrics.targetDays} days`
              : "Days of cover"
        }
      />
      <AnalyticsStat
        label="Stock value"
        value={formatPeso(metrics.inventoryAmount)}
        hint="On-hand stock at selling price"
      />
      <AnalyticsStat label="Branch Stock — STK" value={metrics.stkCount.toLocaleString()} />
      <AnalyticsStat label="In transit" value={metrics.ditCount.toLocaleString()} />
    </div>
  );
}

function AnalyticsStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="shrink-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-base font-semibold whitespace-nowrap tabular-nums tracking-tight">{value}</p>
      {hint ? <p className="max-w-44 text-xs leading-snug whitespace-normal text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function AnalyticsHead({
  label,
  help,
  alignEnd = false,
  className,
}: {
  label: string;
  help?: string;
  alignEnd?: boolean;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "h-auto min-h-9 bg-card px-2 py-1 text-left align-middle text-xs font-medium whitespace-normal text-muted-foreground",
        alignEnd && "text-right",
        className,
      )}
    >
      <span
        className={cn(
          "inline-flex max-w-full flex-wrap items-center gap-0.5",
          alignEnd && "w-full justify-end",
        )}
      >
        <span>{label}</span>
        {help ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`About ${label}`}
              >
                <CircleHelp className="size-3.5" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6} className="z-[100] max-w-64 text-left leading-relaxed">
              {help}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </span>
    </th>
  );
}
