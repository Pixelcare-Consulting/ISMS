"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import type { CreateOrderPrefill } from "@/app/(app)/orders/_components/orders-create-workspace-context";
import { InventoryStatusChips } from "@/app/(app)/orders/_components/inventory-status-chips";
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
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import {
  checkOrderWindowAction,
  createOrderAction,
  listActiveDealersForOrderAction,
  listBranchesForOrderAction,
} from "@/features/orders/actions/order.actions";
import { getBranchOrderWorkspaceAction } from "@/features/orders/actions/order-analytics.actions";
import type { BranchOrderType } from "@prisma/client";
import type {
  OrderAnalyticsLine,
  OrderWorkspacePayload,
} from "@/features/orders/types/order-analytics";
import { formatPeso } from "@/utils/format-currency";
import { cn } from "@/utils/cn";

interface WorkspaceLine extends OrderAnalyticsLine {
  qty: number;
  remarks: string;
  extra?: boolean;
}

function orderTypeLabel(orderType: BranchOrderType): string {
  switch (orderType) {
    case "manual":
      return "Manual (planogram SKUs)";
    case "special":
      return "Special (off-planogram allowed)";
    case "auto_replenish":
      return "Auto replenish (planogram SKUs)";
    default: {
      const _exhaustive: never = orderType;
      return _exhaustive;
    }
  }
}

function extraPickerPlaceholder(orderType: BranchOrderType): string {
  switch (orderType) {
    case "special":
      return "Off-planogram SKU…";
    case "manual":
    case "auto_replenish":
      return "Other planogram SKU…";
    default: {
      const _exhaustive: never = orderType;
      return _exhaustive;
    }
  }
}

function initialQty(orderType: BranchOrderType, line: OrderAnalyticsLine): number {
  if (orderType === "auto_replenish") return line.sugQty;
  return 0;
}

function lineLocked(
  orderType: BranchOrderType,
  line: Pick<WorkspaceLine, "remainingCapacity" | "onPlanogram">,
): boolean {
  if (orderType === "special") return false;
  return line.onPlanogram && line.remainingCapacity <= 0;
}

export function CreateOrderDialog({
  onClose,
  fixedOrderType,
  canAccessSuggestedOrders = false,
  prefill,
}: {
  onClose: () => void;
  fixedOrderType?: BranchOrderType;
  canAccessSuggestedOrders?: boolean;
  prefill?: CreateOrderPrefill;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dealers, setDealers] = useState<{ id: string; name: string }[]>([]);
  const [branches, setBranches] = useState<
    { id: string; name: string; dealerId: string | null }[]
  >([]);
  const [dealerId, setDealerId] = useState(prefill?.dealerId ?? "");
  const [branchId, setBranchId] = useState(prefill?.branchId ?? "");
  const [brandId, setBrandId] = useState(prefill?.brandId ?? "");
  const [orderType] = useState<BranchOrderType>(fixedOrderType ?? "manual");
  const [notes, setNotes] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [workspace, setWorkspace] = useState<OrderWorkspacePayload | null>(null);
  const [lines, setLines] = useState<WorkspaceLine[]>([]);
  const [windowBlock, setWindowBlock] = useState<string | null>(null);
  const [extraModelId, setExtraModelId] = useState("");
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [dealerRows, branchRows] = await Promise.all([
        listActiveDealersForOrderAction(fixedOrderType),
        listBranchesForOrderAction(prefill?.dealerId || undefined, fixedOrderType),
      ]);
      if (cancelled) return;
      setDealers(dealerRows);
      setBranches(branchRows);
      if (prefill?.branchId && !prefill.dealerId) {
        const match = branchRows.find((b) => b.id === prefill.branchId);
        if (match?.dealerId) setDealerId(match.dealerId);
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [fixedOrderType, prefill?.branchId, prefill?.dealerId]);

  useEffect(() => {
    if (!loaded || !dealerId) return;
    let cancelled = false;
    void listBranchesForOrderAction(dealerId, fixedOrderType).then((branchRows) => {
      if (cancelled) return;
      setBranches(branchRows);
      setBranchId((current) =>
        branchRows.some((b) => b.id === current) ? current : (branchRows[0]?.id ?? ""),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [dealerId, loaded, fixedOrderType]);

  useEffect(() => {
    let cancelled = false;
    const branch = branchId;
    void Promise.resolve().then(async () => {
      if (!branch) {
        if (!cancelled) {
          setWindowBlock(null);
          setWorkspace(null);
          setLines([]);
          setExtraModelId("");
        }
        return;
      }
      setLoadingWorkspace(true);
      const [windowRes, workspaceRes] = await Promise.all([
        checkOrderWindowAction(branch, orderType),
        getBranchOrderWorkspaceAction({
          branchId: branch,
          brandId: brandId || null,
          orderType,
        }),
      ]);
      if (cancelled) return;
      setWindowBlock(windowRes.blocked ? windowRes.reason : null);
      if (workspaceRes.error || !workspaceRes.data) {
        toast.error(workspaceRes.error ?? "Failed to load branch SKUs");
        setWorkspace(null);
        setLines([]);
        setExtraModelId("");
        setLoadingWorkspace(false);
        return;
      }
      const data = workspaceRes.data;
      setWorkspace(data);
      if (!brandId && data.brandId) setBrandId(data.brandId);
      setExtraModelId("");
      setLines(
        data.lines.map((line) => ({
          ...line,
          qty: initialQty(orderType, line),
          remarks: "",
        })),
      );
      setLoadingWorkspace(false);
    });
    return () => {
      cancelled = true;
    };
  }, [branchId, brandId, orderType]);

  const submitLines = useMemo(() => lines.filter((line) => line.qty >= 1), [lines]);
  const totalAmount = submitLines.reduce((sum, line) => sum + line.qty * line.srp, 0);
  const totalCbm = submitLines.reduce((sum, line) => sum + line.qty * line.cbm, 0);
  const extraOptions = useMemo(
    () =>
      (workspace?.additionalModels ?? [])
        .filter((model) => !lines.some((line) => line.modelId === model.id))
        .map((model) => ({
          id: model.id,
          label: `${model.skuCode} — ${model.name}`,
        })),
    [lines, workspace?.additionalModels],
  );

  function setLineQty(modelId: string, qty: number) {
    setLines((prev) =>
      prev.map((line) => {
        if (line.modelId !== modelId) return line;
        if (lineLocked(orderType, line)) return line;
        const max =
          orderType === "special" ? undefined : (line.remainingCapacity ?? undefined);
        const next = Number.isFinite(qty) ? Math.max(0, Math.floor(qty)) : 0;
        return { ...line, qty: max != null ? Math.min(next, max) : next };
      }),
    );
  }

  function setLineRemarks(modelId: string, remarks: string) {
    setLines((prev) =>
      prev.map((line) => (line.modelId === modelId ? { ...line, remarks } : line)),
    );
  }

  function addExtraItem() {
    if (!workspace || !extraModelId) return;
    const model = workspace.additionalModels.find((m) => m.id === extraModelId);
    if (!model) return;
    if (lines.some((line) => line.modelId === model.id)) {
      toast.error("That SKU is already on the grid.");
      return;
    }
    setLines((prev) => [
      {
        modelId: model.id,
        skuCode: model.skuCode,
        name: model.name,
        brandId: model.brandId,
        srp: model.srp,
        cbm: model.cbm,
        maxQty: 0,
        milDays: 30,
        inventory: [{ code: "STK", count: 0 }],
        stkQty: 0,
        ditQty: 0,
        salesQty: 0,
        salesAmount: 0,
        rate: null,
        milQty: 0,
        milAmt: 0,
        sugQty: 0,
        remainingCapacity: model.remainingCapacity,
        onPlanogram: model.onPlanogram,
        qty:
          orderType === "special"
            ? 1
            : Math.min(1, Math.max(0, model.remainingCapacity)),
        remarks: "",
        extra: true,
      },
      ...prev,
    ]);
    setExtraModelId("");
  }

  function submit() {
    startTransition(async () => {
      const result = await createOrderAction({
        branchId,
        orderType,
        notes: notes.trim() || undefined,
        brandId: brandId || null,
        details: submitLines.map((line) => ({
          modelId: line.modelId,
          quantity: line.qty,
          remarks: line.remarks.trim() || null,
        })),
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        orderType === "special"
          ? "Special order submitted for SP approval"
          : orderType === "auto_replenish"
            ? "Auto-replenish order submitted for TL review"
            : "Manual order submitted for PS review",
      );
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent
        showCloseButton
        className="flex max-h-[calc(100svh-2rem)] w-[calc(100%-2rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl"
      >
        <DialogHeader className="shrink-0 border-b px-4 py-4 sm:px-6">
          <DialogTitle>Create branch order</DialogTitle>
          <DialogDescription>
            Review branch stock and suggested quantities, then enter quantities for this
            request.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto lg:grid-cols-[minmax(16rem,20rem)_1fr]">
          <aside className="space-y-4 border-b p-4 sm:p-6 lg:border-b-0 lg:border-r">
            {!loaded ? (
              <p className="text-sm text-muted-foreground">Loading dealers and branches…</p>
            ) : (
              <>
                <SearchableSelect
                  label="Dealer"
                  options={dealers.map((d) => ({ id: d.id, label: d.name }))}
                  value={dealerId}
                  onChange={(next) => {
                    setDealerId(next);
                    setBranchId("");
                    setBrandId("");
                    setWorkspace(null);
                    setLines([]);
                    setExtraModelId("");
                  }}
                  allowClear
                  placeholder="Select dealer…"
                  searchPlaceholder="Search dealers…"
                />
                <SearchableSelect
                  label="Branch"
                  options={branches.map((b) => ({ id: b.id, label: b.name }))}
                  value={branchId}
                  onChange={(next) => {
                    setBranchId(next);
                    setBrandId("");
                  }}
                  placeholder={dealerId ? "Select branch…" : "Select a dealer first…"}
                  searchPlaceholder="Search branches…"
                  disabled={!dealerId}
                  emptyMessage="No active branches for this dealer."
                />
                <div className="space-y-1">
                  <Label>Order type</Label>
                  <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                    {orderTypeLabel(orderType)}
                  </p>
                </div>
                {windowBlock ? (
                  <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {windowBlock}
                  </p>
                ) : null}
                {workspace && workspace.brands.length > 0 ? (
                  <div className="space-y-2">
                    <Label>Brand</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {workspace.brands.map((brand) => (
                        <Button
                          key={brand.id}
                          type="button"
                          size="sm"
                          variant={brandId === brand.id ? "default" : "outline"}
                          onClick={() => setBrandId(brand.id)}
                        >
                          {brand.name}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <KpiTile
                    label="Computed DII"
                    value={
                      workspace?.summary.computedDii != null
                        ? workspace.summary.computedDii.toFixed(1)
                        : "—"
                    }
                  />
                  <KpiTile
                    label="Inventory amount"
                    value={formatPeso(workspace?.summary.inventoryAmount ?? 0)}
                  />
                  <KpiTile label="Total amount order" value={formatPeso(totalAmount)} />
                  <KpiTile label="Total CBM" value={totalCbm.toFixed(4)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="order-special-instruction">Special instruction</Label>
                  <Textarea
                    id="order-special-instruction"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Notes for this order…"
                    rows={3}
                  />
                </div>
                {orderType === "auto_replenish" && canAccessSuggestedOrders ? (
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/planning/suggested-orders">View suggested orders</Link>
                  </Button>
                ) : null}
              </>
            )}
          </aside>

          <div className="min-w-0 p-4 sm:p-6">
            {loadingWorkspace ? (
              <p className="text-sm text-muted-foreground">Loading planogram SKUs…</p>
            ) : !branchId ? (
              <p className="text-sm text-muted-foreground">
                Select a dealer and branch to load models.
              </p>
            ) : (
              <>
                {workspace ? (
                  <div className="mb-4 flex flex-wrap items-end gap-2">
                    <div className="min-w-56 flex-1">
                      <SearchableSelect
                        label="Additional item"
                        options={extraOptions}
                        value={extraModelId}
                        onChange={setExtraModelId}
                        placeholder={extraPickerPlaceholder(orderType)}
                        searchPlaceholder="Search models…"
                        emptyMessage="No more models to add."
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!extraModelId}
                      onClick={addExtraItem}
                    >
                      Additional item
                    </Button>
                  </div>
                ) : null}
                {lines.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No planogram SKUs for this branch and brand.
                  </p>
                ) : (
                  <table className="w-full table-fixed border-collapse text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="w-[22%] py-2 pr-2 font-medium">Model</th>
                        <th className="w-[10%] py-2 pr-2 font-medium">INV</th>
                        <th className="w-[8%] py-2 pr-2 font-medium">SALES</th>
                        <th className="w-[8%] py-2 pr-2 font-medium">SUG</th>
                        <th className="w-[8%] py-2 pr-2 font-medium">CBM</th>
                        <th className="w-[12%] py-2 pr-2 font-medium">BRANCH ORD</th>
                        <th className="w-[32%] py-2 font-medium">REMARKS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line) => {
                        const locked = lineLocked(orderType, line);
                        return (
                          <tr key={line.modelId} className="border-b align-top">
                            <td className="min-w-0 py-2 pr-2 whitespace-normal wrap-break-word">
                              <p className="font-medium wrap-break-word">{line.skuCode}</p>
                              <p className="text-xs text-muted-foreground wrap-break-word">
                                {line.name}
                              </p>
                              {line.extra ? (
                                <p className="text-[10px] text-muted-foreground">
                                  Additional item
                                </p>
                              ) : null}
                            </td>
                            <td className="min-w-0 py-2 pr-2">
                              <InventoryStatusChips inventory={line.inventory} />
                            </td>
                            <td className="py-2 pr-2 tabular-nums">{line.salesQty}</td>
                            <td className="py-2 pr-2 tabular-nums">{line.sugQty}</td>
                            <td className="py-2 pr-2 tabular-nums">{line.cbm.toFixed(4)}</td>
                            <td className="min-w-0 py-2 pr-2">
                              <Input
                                type="number"
                                min={0}
                                max={
                                  orderType === "special"
                                    ? undefined
                                    : line.remainingCapacity
                                }
                                disabled={locked}
                                className={cn("h-8 w-full min-w-0", locked && "bg-muted")}
                                value={line.qty}
                                onChange={(e) =>
                                  setLineQty(line.modelId, Number(e.target.value))
                                }
                              />
                            </td>
                            <td className="min-w-0 py-2">
                              <Input
                                value={line.remarks}
                                onChange={(e) =>
                                  setLineRemarks(line.modelId, e.target.value)
                                }
                                placeholder="Optional"
                                className="h-8 w-full min-w-0"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t px-4 py-4 sm:px-6">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={
              pending ||
              !loaded ||
              !dealerId ||
              !branchId ||
              submitLines.length === 0 ||
              windowBlock !== null
            }
            onClick={submit}
          >
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KpiTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 px-2.5 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-medium tabular-nums">{value}</p>
    </div>
  );
}
