"use client";

import type { BranchOrderType } from "@prisma/client";
import { ChevronsUpDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import type { OrderAnalyticsPayload } from "@/features/orders/types/order-analytics";
import { formatPeso } from "@/utils/format-currency";
import { cn } from "@/utils/cn";

function analyticsBranchStorageKey(orderType: BranchOrderType): string {
  return `orders-analytics-branch:${orderType}`;
}

function formatDiiValue(computedDii: number | null): string {
  if (computedDii == null) return "—";
  return Number.isInteger(computedDii) ? String(computedDii) : computedDii.toFixed(1);
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
  const [branchPickerOpen, setBranchPickerOpen] = useState(false);
  const [branchQuery, setBranchQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    void listOrderAnalyticsBranchesAction(orderType).then((rows) => {
      if (cancelled) return;
      setBranches(rows);
      const stored =
        typeof window !== "undefined"
          ? sessionStorage.getItem(analyticsBranchStorageKey(orderType))
          : null;
      const storedValid = stored ? rows.some((row) => row.id === stored) : false;
      if (rows.length === 1) {
        setBranchId(rows[0].id);
      } else if (storedValid && stored) {
        setBranchId(stored);
      } else if (rows.length > 1) {
        setBranchPickerOpen(true);
      }
      setBranchesReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [orderType]);

  useEffect(() => {
    if (!branchId) return;
    let cancelled = false;
    void getOrderAnalyticsAction({
      branchId,
      brandId: brandId || null,
      orderType,
    }).then((result) => {
      if (cancelled) return;
      if (result.error || !result.data) {
        toast.error(result.error ?? "Failed to load analytics");
        setData(null);
        return;
      }
      setData(result.data);
      if (!brandId && result.data.brandId) setBrandId(result.data.brandId);
    });
    return () => {
      cancelled = true;
    };
  }, [branchId, brandId, orderType]);

  const loading =
    !branchesReady ||
    Boolean(
      branchId &&
        (data == null ||
          data.branchId !== branchId ||
          (brandId !== "" && data.brandId !== brandId)),
    );

  const selectedBranch = branches.find((b) => b.id === branchId);
  const filteredBranches = useMemo(() => {
    const query = branchQuery.trim().toLowerCase();
    if (!query) return branches;
    return branches.filter((branch) => branch.name.toLowerCase().includes(query));
  }, [branches, branchQuery]);

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

  function selectBranch(nextId: string) {
    setBranchId(nextId);
    setBrandId("");
    setData(null);
    setBranchPickerOpen(false);
    setBranchQuery("");
    sessionStorage.setItem(analyticsBranchStorageKey(orderType), nextId);
  }

  const brandTabs =
    data && data.brands.length > 0 ? (
      <div
        className="flex flex-wrap gap-1 rounded-xl border bg-card p-1.5 shadow-sm"
        role="tablist"
        aria-label="Brand"
      >
        {data.brands.map((brand) => (
          <Button
            key={brand.id}
            type="button"
            role="tab"
            aria-selected={brandId === brand.id}
            size="sm"
            variant={brandId === brand.id ? "default" : "ghost"}
            className={cn(
              "rounded-lg uppercase",
              brandId !== brand.id && "text-muted-foreground",
            )}
            onClick={() => setBrandId(brand.id)}
          >
            {brand.name}
          </Button>
        ))}
      </div>
    ) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => setBranchPickerOpen(true)}
          className={cn(
            "h-9 min-w-[16rem] max-w-full justify-between border-input bg-card font-normal shadow-sm",
            "hover:border-primary/40 hover:bg-card hover:text-foreground",
          )}
        >
          <span
            className={cn(
              "min-w-0 truncate text-left",
              !selectedBranch && "text-muted-foreground",
            )}
          >
            {selectedBranch?.name ?? "Select branch…"}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
        {canEdit ? (
          <Button
            disabled={!branchId}
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
        open={branchPickerOpen}
        onOpenChange={(open) => {
          setBranchPickerOpen(open);
          if (!open) setBranchQuery("");
        }}
      >
        <DialogContent className="flex max-h-[min(32rem,calc(100svh-2rem))] flex-col gap-0 overflow-hidden p-0">
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
                          branch.id === branchId && "bg-muted font-medium",
                        )}
                        onClick={() => selectBranch(branch.id)}
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
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setBranchPickerOpen(false);
                setBranchQuery("");
              }}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {brandTabs}

      {data && brandId ? (
        <OrderSummaryTable
          className="max-w-none"
          rows={[
            {
              label: "DII",
              value: formatDiiValue(data.summary.computedDii),
            },
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
      ) : !branchId ? (
        <p className="text-sm text-muted-foreground">
          Choose a branch to see stock, sales, and suggested quantities.
        </p>
      ) : !brandId && (data?.brands.length ?? 0) > 0 ? (
        <p className="text-sm text-muted-foreground">
          Select a brand to see planogram models.
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
