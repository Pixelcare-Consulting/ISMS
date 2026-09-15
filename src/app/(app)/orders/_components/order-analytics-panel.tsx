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
import type {
  OrderAnalyticsBrand,
  OrderAnalyticsPayload,
} from "@/features/orders/types/order-analytics";
import { GlobalKpiCards } from "@/lib/kpi-cards";
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

function persistBranch(orderType: BranchOrderType, nextBranchId: string) {
  sessionStorage.setItem(analyticsBranchStorageKey(orderType), nextBranchId);
}

function persistBrand(orderType: BranchOrderType, nextBrandId: string) {
  if (!nextBrandId) {
    sessionStorage.removeItem(analyticsBrandStorageKey(orderType));
    return;
  }
  sessionStorage.setItem(analyticsBrandStorageKey(orderType), nextBrandId);
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
  const [cardBrands, setCardBrands] = useState<OrderAnalyticsBrand[]>([]);
  const [cardBrandsLoading, setCardBrandsLoading] = useState(false);
  const brandsRequestId = useRef(0);

  const hasMultipleBranches = branches.length > 1;
  const hasSingleAssignedBranch = branches.length === 1;

  function assignBrand(nextBrandId: string) {
    if (nextBrandId !== brandId) {
      setData(null);
    }
    setBrandId(nextBrandId);
    persistBrand(orderType, nextBrandId);
  }

  async function loadCardBrands(nextBranchId: string, preferredBrandId: string | null) {
    const requestId = ++brandsRequestId.current;
    setCardBrandsLoading(true);
    const result = await getOrderAnalyticsAction({
      branchId: nextBranchId,
      brandId: null,
      orderType,
    });
    if (requestId !== brandsRequestId.current) return;
    setCardBrandsLoading(false);
    if (result.error || !result.data) {
      toast.error(result.error ?? "Failed to load brands");
      setCardBrands([]);
      assignBrand("");
      return;
    }
    const brands = result.data.brands;
    setCardBrands(brands);
    assignBrand(resolveBrandId(brands, preferredBrandId));
  }

  function applyPendingBranch() {
    if (!pendingBranchId) return;
    if (pendingBranchId !== branchId) {
      setData(null);
      setBrandId("");
      persistBrand(orderType, "");
      setCardBrands([]);
      setBranchId(pendingBranchId);
      persistBranch(orderType, pendingBranchId);
      void loadCardBrands(pendingBranchId, null);
    }
    setPickerOpen(false);
    setBranchQuery("");
  }

  function closePicker() {
    setPickerOpen(false);
    setBranchQuery("");
    setPendingBranchId(branchId);
  }

  function openPicker() {
    setPendingBranchId(branchId);
    setBranchQuery("");
    setPickerOpen(true);
  }

  function clearFilters() {
    setData(null);
    setBrandId("");
    persistBrand(orderType, "");
    if (hasMultipleBranches) {
      setBranchId("");
      setPendingBranchId("");
      setCardBrands([]);
      sessionStorage.removeItem(analyticsBranchStorageKey(orderType));
      return;
    }
    if (hasSingleAssignedBranch) {
      void loadCardBrands(branches[0].id, null);
    } else {
      setCardBrands([]);
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

      if (rows.length === 0) {
        setBranchesReady(true);
        return;
      }

      const initialBranch =
        rows.length === 1
          ? rows[0].id
          : storedBranchValid && storedBranch
            ? storedBranch
            : "";

      if (!initialBranch) {
        setPickerOpen(true);
        setBranchesReady(true);
        return;
      }

      setBranchId(initialBranch);
      setPendingBranchId(initialBranch);
      persistBranch(orderType, initialBranch);

      const result = await getOrderAnalyticsAction({
        branchId: initialBranch,
        brandId: null,
        orderType,
      });
      if (cancelled) return;
      if (result.error || !result.data) {
        toast.error(result.error ?? "Failed to load brands");
        setCardBrands([]);
        setBranchesReady(true);
        return;
      }

      const brands = result.data.brands;
      setCardBrands(brands);
      const initialBrand = resolveBrandId(brands, storedBrand);
      setBrandId(initialBrand);
      persistBrand(orderType, initialBrand);
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
        persistBrand(orderType, "");
        setCardBrands(result.data.brands);
        return;
      }
      if (resolvedBrandId !== brandId) {
        setBrandId(resolvedBrandId);
        persistBranch(orderType, branchId);
        persistBrand(orderType, resolvedBrandId);
        return;
      }

      setCardBrands(result.data.brands);
      setData(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [branchId, brandId, orderType]);

  const analyticsLoading = Boolean(
    branchId &&
      brandId &&
      (data == null || data.branchId !== branchId || data.brandId !== brandId),
  );

  const selectedBranch = branches.find((b) => b.id === branchId);
  const selectedBrandName =
    data?.brands.find((brand) => brand.id === brandId)?.name ??
    cardBrands.find((brand) => brand.id === brandId)?.name ??
    null;

  const searchQuery = branchQuery.trim();
  const filteredBranches = useMemo(() => {
    const query = searchQuery.toLowerCase();
    if (!query) return [];
    return branches.filter((branch) => branch.name.toLowerCase().includes(query));
  }, [branches, searchQuery]);

  const brandOptions = useMemo(
    () => cardBrands.map((brand) => ({ id: brand.id, label: brand.name })),
    [cardBrands],
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

  const selectionApplied = Boolean(branchId && brandId);
  const canClear = Boolean(brandId || (branchId && hasMultipleBranches));

  const heading = (() => {
    if (branchesReady && branches.length === 0) {
      return "No branch in your area of responsibility";
    }
    if (branchId) {
      return selectedBranch?.name ?? data?.branchName ?? "Select a branch";
    }
    return "Select a branch";
  })();

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <h2
              className={cn(
                "truncate text-2xl font-semibold tracking-tight sm:text-3xl",
                !branchId && "text-muted-foreground",
              )}
            >
              {heading}
            </h2>
            {selectedBrandName ? (
              <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                {selectedBrandName}
              </p>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-wrap items-end gap-2">
            <div className="w-56 min-w-44">
              <SearchableSelect
                label="Brand"
                options={brandOptions}
                value={brandId}
                onChange={assignBrand}
                placeholder={
                  !branchId
                    ? "Choose a branch first"
                    : cardBrandsLoading
                      ? "Loading brands…"
                      : "Select brand…"
                }
                searchPlaceholder="Search brands…"
                emptyMessage="No brands on this planogram."
                disabled={!branchId || cardBrandsLoading}
              />
            </div>
            {hasMultipleBranches ? (
              <Button type="button" variant="outline" onClick={openPicker}>
                Change
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              disabled={!canClear}
              onClick={clearFilters}
            >
              Clear
            </Button>
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
        </div>
      </div>

      <Dialog
        open={pickerOpen}
        onOpenChange={(open) => {
          if (open) {
            openPicker();
            return;
          }
          closePicker();
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
              {!searchQuery ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Type to search branches
                </p>
              ) : filteredBranches.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No branches match your search.
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
                        onClick={() => setPendingBranchId(branch.id)}
                      >
                        {branch.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t px-4 py-3 sm:px-6">
            <Button type="button" variant="outline" onClick={closePicker}>
              Cancel
            </Button>
            <Button type="button" disabled={!pendingBranchId} onClick={applyPendingBranch}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {data && brandId ? (
        <GlobalKpiCards
          items={[
            {
              key: "dii",
              label: "DII",
              value: formatDiiValue(data.summary.computedDii),
            },
            {
              key: "inventory",
              label: "Inventory",
              value: (
                <span className="inline-flex text-sm font-medium">
                  <InventoryStatusChips
                    inventory={[
                      { code: "STK", count: data.summary.stkCount },
                      { code: "DIT", count: data.summary.ditCount },
                    ]}
                  />
                </span>
              ),
            },
            {
              key: "inventory-amt",
              label: "Inventory Amt.",
              value: formatPeso(data.summary.inventoryAmount),
            },
          ]}
        />
      ) : null}

      {!branchesReady || analyticsLoading ? (
        <p className="text-sm text-muted-foreground">Loading analytics…</p>
      ) : !branchId ? (
        <p className="text-sm text-muted-foreground">
          {branches.length === 0
            ? "No branch in your area. Assign an AOR before reviewing analytics."
            : "Search for a branch, then choose a brand to see stock, sales, and suggested quantities."}
        </p>
      ) : !brandId ? (
        <p className="text-sm text-muted-foreground">
          Select a brand to see stock, sales, and suggested quantities.
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
