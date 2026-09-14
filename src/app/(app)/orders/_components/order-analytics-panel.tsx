"use client";

import type { BranchOrderType } from "@prisma/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { InventoryStatusChips } from "@/app/(app)/orders/_components/inventory-status-chips";
import { useOrdersCreateWorkspace } from "@/app/(app)/orders/_components/orders-create-workspace-context";
import {
  DataTableShell,
  TablePageSizeSelect,
  TablePagination,
  useClientTablePagination,
} from "@/components/data-table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getOrderAnalyticsAction,
  listOrderAnalyticsBranchesAction,
} from "@/features/orders/actions/order-analytics.actions";
import { OrderSummaryTable } from "@/features/orders/components/order-summary-table";
import type {
  OrderAnalyticsBrand,
  OrderAnalyticsPayload,
} from "@/features/orders/types/order-analytics";
import { formatPeso } from "@/utils/format-currency";
import { cn } from "@/utils/cn";

function analyticsBranchStorageKey(orderType: BranchOrderType): string {
  return `orders-analytics-branch:${orderType}`;
}

function analyticsBrandStorageKey(orderType: BranchOrderType): string {
  return `orders-analytics-brand:${orderType}`;
}

function formatDiiValue(computedDii: number | null): string {
  if (computedDii == null) return "—";
  return Number.isInteger(computedDii) ? String(computedDii) : computedDii.toFixed(1);
}

function resolveBrandId(
  brands: OrderAnalyticsBrand[],
  preferredId: string | null,
): string {
  if (preferredId && brands.some((brand) => brand.id === preferredId)) {
    return preferredId;
  }
  if (brands.length === 1) return brands[0].id;
  return "";
}

export function OrderAnalyticsPanel({ orderType }: { orderType: BranchOrderType }) {
  const { canEdit, openCreate } = useOrdersCreateWorkspace();
  const [branches, setBranches] = useState<
    { id: string; name: string; dealerId: string | null }[]
  >([]);
  const [branchId, setBranchId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [data, setData] = useState<OrderAnalyticsPayload | null>(null);
  const [branchesReady, setBranchesReady] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [branchQuery, setBranchQuery] = useState("");
  const [pendingBranchId, setPendingBranchId] = useState("");
  const [pendingBrandId, setPendingBrandId] = useState("");
  const [dialogBrands, setDialogBrands] = useState<OrderAnalyticsBrand[]>([]);
  const [dialogBrandsLoading, setDialogBrandsLoading] = useState(false);
  const brandsRequestId = useRef(0);

  function persistSelection(nextBranchId: string, nextBrandId: string) {
    sessionStorage.setItem(analyticsBranchStorageKey(orderType), nextBranchId);
    sessionStorage.setItem(analyticsBrandStorageKey(orderType), nextBrandId);
  }

  function applySelection(nextBranchId: string, nextBrandId: string) {
    if (nextBranchId !== branchId || nextBrandId !== brandId) {
      setData(null);
    }
    setBranchId(nextBranchId);
    setBrandId(nextBrandId);
    persistSelection(nextBranchId, nextBrandId);
    setPickerOpen(false);
    setBranchQuery("");
  }

  async function loadDialogBrands(nextBranchId: string, preferredBrandId: string) {
    const requestId = ++brandsRequestId.current;
    setDialogBrandsLoading(true);
    const result = await getOrderAnalyticsAction({
      branchId: nextBranchId,
      brandId: null,
      orderType,
    });
    if (requestId !== brandsRequestId.current) return;
    setDialogBrandsLoading(false);
    if (result.error || !result.data) {
      toast.error(result.error ?? "Failed to load brands");
      setDialogBrands([]);
      setPendingBrandId("");
      return;
    }
    const brands = result.data.brands;
    setDialogBrands(brands);
    setPendingBrandId(resolveBrandId(brands, preferredBrandId || null));
  }

  function openPicker() {
    setPendingBranchId(branchId);
    setPendingBrandId(brandId);
    setBranchQuery("");
    setPickerOpen(true);
    if (data && data.branchId === branchId) {
      setDialogBrands(data.brands);
      return;
    }
    if (branchId) {
      void loadDialogBrands(branchId, brandId);
    } else {
      setDialogBrands([]);
    }
  }

  useEffect(() => {
    let cancelled = false;

    void listOrderAnalyticsBranchesAction(orderType).then(async (rows) => {
      if (cancelled) return;
      setBranches(rows);
      const storedBranch =
        typeof window !== "undefined"
          ? sessionStorage.getItem(analyticsBranchStorageKey(orderType))
          : null;
      const storedBrand =
        typeof window !== "undefined"
          ? sessionStorage.getItem(analyticsBrandStorageKey(orderType))
          : null;
      const storedBranchValid = storedBranch
        ? rows.some((row) => row.id === storedBranch)
        : false;
      const initialBranch =
        rows.length === 1 ? rows[0].id : storedBranchValid && storedBranch ? storedBranch : "";

      if (!initialBranch) {
        if (rows.length > 1) setPickerOpen(true);
        setBranchesReady(true);
        return;
      }

      if (storedBrand) {
        setBranchId(initialBranch);
        setBrandId(storedBrand);
        setPendingBranchId(initialBranch);
        setPendingBrandId(storedBrand);
        setBranchesReady(true);
        return;
      }

      const result = await getOrderAnalyticsAction({
        branchId: initialBranch,
        brandId: null,
        orderType,
      });
      if (cancelled) return;
      const brands = result.data?.brands ?? [];
      const initialBrand = resolveBrandId(brands, null);
      setDialogBrands(brands);
      setPendingBranchId(initialBranch);
      if (initialBrand) {
        setBranchId(initialBranch);
        setBrandId(initialBrand);
        setPendingBrandId(initialBrand);
        sessionStorage.setItem(analyticsBranchStorageKey(orderType), initialBranch);
        sessionStorage.setItem(analyticsBrandStorageKey(orderType), initialBrand);
      } else {
        setPendingBrandId("");
        setPickerOpen(true);
      }
      setBranchesReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [orderType]);

  useEffect(() => {
    if (!branchId || !brandId) return;
    let cancelled = false;
    void getOrderAnalyticsAction({
      branchId,
      brandId,
      orderType,
    }).then((result) => {
      if (cancelled) return;
      if (result.error || !result.data) {
        toast.error(result.error ?? "Failed to load analytics");
        setData(null);
        return;
      }

      const resolvedBrandId = resolveBrandId(result.data.brands, brandId);
      if (!resolvedBrandId) {
        setData(null);
        setBrandId("");
        setPendingBranchId(branchId);
        setPendingBrandId("");
        setDialogBrands(result.data.brands);
        sessionStorage.removeItem(analyticsBrandStorageKey(orderType));
        setPickerOpen(true);
        return;
      }
      if (resolvedBrandId !== brandId) {
        setBrandId(resolvedBrandId);
        sessionStorage.setItem(analyticsBranchStorageKey(orderType), branchId);
        sessionStorage.setItem(analyticsBrandStorageKey(orderType), resolvedBrandId);
        return;
      }

      setData(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [branchId, brandId, orderType]);

  const loading =
    !branchesReady ||
    Boolean(
      branchId &&
        brandId &&
        (data == null || data.branchId !== branchId || data.brandId !== brandId),
    );

  const selectedBranch = branches.find((b) => b.id === branchId);
  const selectedBrandName =
    data?.brands.find((brand) => brand.id === brandId)?.name ??
    dialogBrands.find((brand) => brand.id === brandId)?.name ??
    null;

  const filteredBranches = useMemo(() => {
    const query = branchQuery.trim().toLowerCase();
    if (!query) return branches;
    return branches.filter((branch) => branch.name.toLowerCase().includes(query));
  }, [branches, branchQuery]);

  const brandOptions = useMemo(
    () => dialogBrands.map((brand) => ({ id: brand.id, label: brand.name })),
    [dialogBrands],
  );

  const analyticsLines = data?.lines ?? [];
  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    total,
    totalPages,
    pageItems,
  } = useClientTablePagination(analyticsLines, {
    resetKey: `${branchId}:${brandId}`,
  });

  const totals = useMemo(() => {
    if (!data) return null;
    return data.lines.reduce(
      (acc, line) => ({
        stkQty: acc.stkQty + line.stkQty,
        salesQty: acc.salesQty + line.salesQty,
        milQty: acc.milQty + line.milQty,
        milAmt: acc.milAmt + line.milAmt,
        sugQty: acc.sugQty + line.sugQty,
      }),
      { stkQty: 0, salesQty: 0, milQty: 0, milAmt: 0, sugQty: 0 },
    );
  }, [data]);

  function selectPendingBranch(nextId: string) {
    if (nextId === pendingBranchId) return;
    setPendingBranchId(nextId);
    setPendingBrandId("");
    setDialogBrands([]);
    void loadDialogBrands(nextId, "");
  }

  const selectionApplied = Boolean(branchId && brandId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          {selectionApplied ? (
            <>
              <div className="flex flex-wrap items-baseline gap-2">
                <h2 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">
                  {selectedBranch?.name ?? data?.branchName}
                </h2>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 px-2 text-muted-foreground"
                  onClick={openPicker}
                >
                  Change
                </Button>
              </div>
              {selectedBrandName ? (
                <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                  {selectedBrandName}
                </p>
              ) : null}
            </>
          ) : (
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 className="text-xl font-semibold text-muted-foreground">
                Select a branch and brand
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 px-2"
                onClick={openPicker}
              >
                Change
              </Button>
            </div>
          )}
        </div>
        {canEdit ? (
          <Button
            disabled={!selectionApplied}
            onClick={() =>
              openCreate({
                dealerId: selectedBranch?.dealerId ?? data?.dealerId ?? undefined,
                branchId,
                brandId: brandId || undefined,
              })
            }
          >
            Proceed to order
          </Button>
        ) : null}
      </div>

      <Dialog
        open={pickerOpen}
        onOpenChange={(open) => {
          setPickerOpen(open);
          if (!open) {
            setBranchQuery("");
            setPendingBranchId(branchId);
            setPendingBrandId(brandId);
          }
        }}
      >
        <DialogContent className="flex max-h-[min(36rem,calc(100svh-2rem))] flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b px-4 py-4 sm:px-6">
            <DialogTitle>Select branch</DialogTitle>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 sm:px-6">
            <Input
              value={branchQuery}
              onChange={(event) => setBranchQuery(event.target.value)}
              placeholder="Search branches…"
              aria-label="Search branches"
            />
            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border">
              {filteredBranches.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No branches in your area.
                </p>
              ) : (
                <ul className="divide-y">
                  {filteredBranches.map((branch) => (
                    <li key={branch.id}>
                      <button
                        type="button"
                        className={cn(
                          "flex w-full px-3 py-2.5 text-left text-sm hover:bg-muted/60",
                          branch.id === pendingBranchId && "bg-muted font-medium",
                        )}
                        onClick={() => selectPendingBranch(branch.id)}
                      >
                        {branch.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <SearchableSelect
              label="Brand"
              options={brandOptions}
              value={pendingBrandId}
              onChange={setPendingBrandId}
              placeholder={
                !pendingBranchId
                  ? "Choose a branch first"
                  : dialogBrandsLoading
                    ? "Loading brands…"
                    : "Select brand…"
              }
              searchPlaceholder="Search brands…"
              emptyMessage="No brands on this planogram."
              disabled={!pendingBranchId || dialogBrandsLoading}
              popoverClassName="z-70"
            />
          </div>
          <DialogFooter className="shrink-0 border-t px-4 py-3 sm:px-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPickerOpen(false);
                setBranchQuery("");
                setPendingBranchId(branchId);
                setPendingBrandId(brandId);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!pendingBranchId || !pendingBrandId || dialogBrandsLoading}
              onClick={() => applySelection(pendingBranchId, pendingBrandId)}
            >
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {data && brandId ? (
        <OrderSummaryTable
          className="max-w-none"
          rows={[
            { label: "DII", value: formatDiiValue(data.summary.computedDii) },
            {
              label: "INVENTORY",
              value: (
                <InventoryStatusChips
                  inventory={[
                    { code: "STK", count: data.summary.stkCount },
                    { code: "DIT", count: data.summary.ditCount },
                  ]}
                />
              ),
            },
            {
              label: "INVENTORY AMT.",
              value: formatPeso(data.summary.inventoryAmount),
            },
          ]}
        />
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading analytics…</p>
      ) : !selectionApplied ? (
        <p className="text-sm text-muted-foreground">
          Choose a branch and brand to see stock, sales, and suggested quantities.
        </p>
      ) : !data || data.lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No planogram models for this branch.
        </p>
      ) : (
        <DataTableShell>
          <Table className="min-w-3xl">
            <TableHeader className="bg-muted">
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-3">Model</TableHead>
                <TableHead className="px-3">INV</TableHead>
                <TableHead className="px-3">SALES</TableHead>
                <TableHead className="px-3">RATE</TableHead>
                <TableHead className="px-3">MIL QTY</TableHead>
                <TableHead className="px-3">MIL AMT</TableHead>
                <TableHead className="px-3">SUG QTY</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((line) => (
                <TableRow key={line.modelId} className="even:bg-muted/50">
                  <TableCell className="px-3 py-2">
                    <p className="font-medium">{line.skuCode}</p>
                    <p className="text-xs text-muted-foreground">{line.name}</p>
                  </TableCell>
                  <TableCell className="px-3 py-2">
                    <InventoryStatusChips inventory={line.inventory} />
                  </TableCell>
                  <TableCell className="px-3 py-2 tabular-nums">{line.salesQty}</TableCell>
                  <TableCell className="px-3 py-2 tabular-nums">
                    {line.rate != null ? `${(line.rate * 100).toFixed(1)}%` : "—"}
                  </TableCell>
                  <TableCell className="px-3 py-2 tabular-nums">{line.milQty}</TableCell>
                  <TableCell className="px-3 py-2 tabular-nums">
                    {formatPeso(line.milAmt)}
                  </TableCell>
                  <TableCell className="px-3 py-2 tabular-nums">{line.sugQty}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            {totals ? (
              <TableFooter>
                <TableRow className="hover:bg-transparent">
                  <TableCell className="px-3 py-2 font-semibold">TOTAL</TableCell>
                  <TableCell className="px-3 py-2 tabular-nums">STK {totals.stkQty}</TableCell>
                  <TableCell className="px-3 py-2 tabular-nums">{totals.salesQty}</TableCell>
                  <TableCell className="px-3 py-2 tabular-nums">100%</TableCell>
                  <TableCell className="px-3 py-2 tabular-nums">{totals.milQty}</TableCell>
                  <TableCell className="px-3 py-2 tabular-nums">
                    {formatPeso(totals.milAmt)}
                  </TableCell>
                  <TableCell className="px-3 py-2 tabular-nums">{totals.sugQty}</TableCell>
                </TableRow>
              </TableFooter>
            ) : null}
          </Table>
          <div className="flex flex-wrap items-center px-4 pt-3">
            <TablePageSizeSelect value={pageSize} onChange={setPageSize} />
          </div>
          <TablePagination
            meta={{
              total,
              page,
              totalPages,
              itemLabel: "model",
            }}
            onPageChange={setPage}
          />
        </DataTableShell>
      )}
    </div>
  );
}
