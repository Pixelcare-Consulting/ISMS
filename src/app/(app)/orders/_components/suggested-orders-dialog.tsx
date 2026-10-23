"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  applyOrderSuggestionsAction,
  listBranchesForOrderAction,
  listOrderSuggestionsAction,
} from "@/features/orders/actions/order.actions";
import type { OrderSuggestionRow } from "@/features/orders/services/suggestion-apply.service";
import type { BranchOrderType } from "@prisma/client";
import { cn } from "@/utils/cn";

type BranchOption = { id: string; name: string; dealerId: string | null };

type RowState = {
  selected: boolean;
  qty: number;
};

function orderTypeTitle(orderType: BranchOrderType): string {
  switch (orderType) {
    case "auto_replenish":
      return "Auto replenish";
    case "manual":
      return "Manual";
    case "special":
      return "Special";
    default: {
      const _exhaustive: never = orderType;
      return _exhaustive;
    }
  }
}

export function SuggestedOrdersDialog({
  orderType,
  onClose,
}: {
  orderType: BranchOrderType;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [branchesLoaded, setBranchesLoaded] = useState(false);
  const [branchId, setBranchId] = useState("");
  const [rows, setRows] = useState<OrderSuggestionRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [hasOpenDraft, setHasOpenDraft] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void listBranchesForOrderAction(undefined, orderType).then((branchRows) => {
      if (cancelled) return;
      setBranches(branchRows);
      setBranchesLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [orderType]);

  useEffect(() => {
    if (!branchId) return;
    let cancelled = false;
    void Promise.resolve().then(async () => {
      setLoadingRows(true);
      setLoadError(null);
      const result = await listOrderSuggestionsAction({ branchId, orderType });
      if (cancelled) return;
      if ("error" in result && result.error) {
        setRows([]);
        setMessage(null);
        setHasOpenDraft(false);
        setRowState({});
        setLoadError(result.error);
        setLoadingRows(false);
        return;
      }
      if (!("data" in result) || !result.data) {
        setLoadError("Failed to load suggestions");
        setLoadingRows(false);
        return;
      }
      const data = result.data;
      setRows(data.rows);
      setMessage(data.message);
      setHasOpenDraft(data.hasOpenDraft);
      setRowState(
        Object.fromEntries(
          data.rows.map((row) => [
            row.modelId,
            { selected: false, qty: row.suggestedQty && row.suggestedQty > 0 ? row.suggestedQty : 1 },
          ]),
        ),
      );
      setLoadingRows(false);
    });
    return () => {
      cancelled = true;
    };
  }, [branchId, orderType, reloadKey]);

  const selectableRows = rows.filter((row) => row.canSelect);
  const selectedRows = selectableRows.filter((row) => rowState[row.modelId]?.selected);
  const allSelected =
    selectableRows.length > 0 && selectedRows.length === selectableRows.length;

  const primaryLabel = hasOpenDraft ? "Add to Draft" : "Create Draft Order";
  const specialOnly = orderType === "special";

  const selectionInvalid = useMemo(
    () =>
      selectedRows.some((row) => {
        const qty = rowState[row.modelId]?.qty ?? 0;
        const max = row.suggestedQty ?? 0;
        return !Number.isInteger(qty) || qty < 1 || qty > max;
      }),
    [rowState, selectedRows],
  );

  function setQty(modelId: string, qty: number) {
    setRowState((current) => ({
      ...current,
      [modelId]: { selected: current[modelId]?.selected ?? false, qty },
    }));
  }

  function toggleRow(modelId: string, selected: boolean) {
    setRowState((current) => ({
      ...current,
      [modelId]: { qty: current[modelId]?.qty ?? 1, selected },
    }));
  }

  function toggleAll(selected: boolean) {
    setRowState((current) => {
      const next = { ...current };
      for (const row of selectableRows) {
        next[row.modelId] = { qty: next[row.modelId]?.qty ?? row.suggestedQty ?? 1, selected };
      }
      return next;
    });
  }

  function applySelection() {
    if (!branchId || selectedRows.length === 0) return;
    startTransition(async () => {
      const result = await applyOrderSuggestionsAction({
        branchId,
        orderType,
        lines: selectedRows.map((row) => ({
          modelId: row.modelId,
          quantity: rowState[row.modelId]?.qty ?? 0,
        })),
      });
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      if (!("success" in result)) {
        toast.error("Failed to add suggestions to the draft");
        return;
      }
      const reviewText = result.reviews
        .map((review) => `${review.modelCode}: ${review.message}`)
        .join(" ");
      const title =
        result.applied.length === 0
          ? "Draft line needs review"
          : result.createdDraft
            ? "Draft order created"
            : "Added to draft";
      toast.success(title, {
        description: reviewText || "The order stays a draft until you submit it for review.",
      });
      router.refresh();
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex max-h-[calc(100svh-1rem)] w-[calc(100%-1rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="space-y-1 border-b px-4 py-4 pr-12 sm:px-6">
          <DialogTitle>Suggested orders</DialogTitle>
          <DialogDescription>
            {orderTypeTitle(orderType)} suggestions for one branch. Adding them creates or updates a
            draft. Nothing is submitted until you submit that draft for review.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
          <SearchableSelect
            label="Branch"
            options={branches.map((branch) => ({ id: branch.id, label: branch.name }))}
            value={branchId}
            onChange={setBranchId}
            placeholder={branchesLoaded ? "Choose a branch" : "Loading branches…"}
            searchPlaceholder="Search branches…"
            emptyMessage="No branches in your area."
          />

          {!branchId ? (
            <p className="text-sm text-muted-foreground">Choose a branch to see suggestions.</p>
          ) : null}

          {branchId && loadingRows ? (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : null}

          {branchId && !loadingRows && loadError ? (
            <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm text-destructive">{loadError}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => setReloadKey((key) => key + 1)}>
                Try again
              </Button>
            </div>
          ) : null}

          {branchId && !loadingRows && !loadError && message ? (
            <p className="text-sm text-muted-foreground">{message}</p>
          ) : null}

          {branchId && !loadingRows && !loadError && !message && rows.length === 0 && !specialOnly ? (
            <p className="text-sm text-muted-foreground">No suggestions for this branch.</p>
          ) : null}

          {branchId && !loadingRows && !loadError && rows.length > 0 ? (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allSelected || (selectedRows.length > 0 ? "indeterminate" : false)}
                          onCheckedChange={(checked) => toggleAll(checked === true)}
                          disabled={selectableRows.length === 0}
                          aria-label="Select all suggestions"
                        />
                      </TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Source</TableHead>
                      {orderType === "auto_replenish" ? <TableHead>Period</TableHead> : null}
                      <TableHead>{orderType === "auto_replenish" ? "Branch Stock — STK" : "STK"}</TableHead>
                      <TableHead>{orderType === "auto_replenish" ? "Drop 1" : "Outstanding"}</TableHead>
                      <TableHead>Suggested</TableHead>
                      <TableHead className="w-28">Qty to add</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <SuggestionTableRow
                        key={row.modelId}
                        row={row}
                        orderType={orderType}
                        state={rowState[row.modelId]}
                        onToggle={toggleRow}
                        onQty={setQty}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-3 md:hidden">
                {rows.map((row) => (
                  <SuggestionCard
                    key={row.modelId}
                    row={row}
                    orderType={orderType}
                    state={rowState[row.modelId]}
                    onToggle={toggleRow}
                    onQty={setQty}
                  />
                ))}
              </div>
            </>
          ) : null}
        </div>

        <DialogFooter className="sticky bottom-0 border-t bg-card px-4 py-3 sm:px-6">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Close
          </Button>
          {specialOnly ? null : (
            <Button
              type="button"
              disabled={pending || !branchId || selectedRows.length === 0 || selectionInvalid || loadingRows}
              onClick={applySelection}
            >
              {pending ? "Saving draft…" : primaryLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SuggestionTableRow({
  row,
  orderType,
  state,
  onToggle,
  onQty,
}: {
  row: OrderSuggestionRow;
  orderType: BranchOrderType;
  state: RowState | undefined;
  onToggle: (modelId: string, selected: boolean) => void;
  onQty: (modelId: string, qty: number) => void;
}) {
  const max = row.suggestedQty ?? 0;
  return (
    <TableRow>
      <TableCell>
        <Checkbox
          checked={state?.selected ?? false}
          disabled={!row.canSelect}
          onCheckedChange={(checked) => onToggle(row.modelId, checked === true)}
          aria-label={`Select ${row.modelCode}`}
        />
      </TableCell>
      <TableCell className="font-mono text-sm">{row.modelCode}</TableCell>
      <TableCell>{row.description}</TableCell>
      <TableCell>
        <SourceCell row={row} />
      </TableCell>
      {orderType === "auto_replenish" ? <TableCell>{row.periodLabel ?? "—"}</TableCell> : null}
      <TableCell className="tabular-nums">
        {orderType === "auto_replenish" ? (row.onHandQty ?? "—") : (row.stkQty ?? "—")}
      </TableCell>
      <TableCell className="tabular-nums">
        {orderType === "auto_replenish" ? (row.drop1Qty ?? "—") : (row.outstandingQty ?? "—")}
      </TableCell>
      <TableCell className="tabular-nums">{row.suggestedQty ?? "—"}</TableCell>
      <TableCell>
        <QtyField row={row} qty={state?.qty ?? 1} max={max} onQty={onQty} />
      </TableCell>
    </TableRow>
  );
}

function SuggestionCard({
  row,
  orderType,
  state,
  onToggle,
  onQty,
}: {
  row: OrderSuggestionRow;
  orderType: BranchOrderType;
  state: RowState | undefined;
  onToggle: (modelId: string, selected: boolean) => void;
  onQty: (modelId: string, qty: number) => void;
}) {
  const max = row.suggestedQty ?? 0;
  return (
    <article className="space-y-3 rounded-lg border p-3">
      <div className="flex items-start gap-3">
        <Checkbox
          checked={state?.selected ?? false}
          disabled={!row.canSelect}
          onCheckedChange={(checked) => onToggle(row.modelId, checked === true)}
          aria-label={`Select ${row.modelCode}`}
          className="mt-1"
        />
        <div className="min-w-0">
          <p className="font-mono text-sm">{row.modelCode}</p>
          <p className="text-sm text-muted-foreground">{row.description}</p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <Fact label="Source" value={row.sourceLabel} />
        {orderType === "auto_replenish" ? <Fact label="Period" value={row.periodLabel ?? "—"} /> : null}
        <Fact
          label={orderType === "auto_replenish" ? "Branch Stock — STK" : "STK"}
          value={String(orderType === "auto_replenish" ? (row.onHandQty ?? "—") : (row.stkQty ?? "—"))}
        />
        <Fact
          label={orderType === "auto_replenish" ? "Drop 1" : "Outstanding"}
          value={String(orderType === "auto_replenish" ? (row.drop1Qty ?? "—") : (row.outstandingQty ?? "—"))}
        />
        <Fact label="Suggested" value={row.suggestedQty == null ? "—" : String(row.suggestedQty)} />
      </dl>
      {row.sourceChanged ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">Suggestion changed since this draft line was added.</p>
      ) : null}
      {row.message ? <p className="text-xs text-muted-foreground">{row.message}</p> : null}
      <QtyField row={row} qty={state?.qty ?? 1} max={max} onQty={onQty} />
    </article>
  );
}

function SourceCell({ row }: { row: OrderSuggestionRow }) {
  return (
    <div className="space-y-1">
      <p>{row.sourceLabel}</p>
      {row.sourceChanged ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">Suggestion changed</p>
      ) : null}
      {row.message ? <p className="text-xs text-muted-foreground">{row.message}</p> : null}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function QtyField({
  row,
  qty,
  max,
  onQty,
}: {
  row: OrderSuggestionRow;
  qty: number;
  max: number;
  onQty: (modelId: string, qty: number) => void;
}) {
  return (
    <Input
      type="number"
      min={1}
      max={max > 0 ? max : undefined}
      value={qty}
      disabled={!row.canSelect}
      aria-label={`Quantity to add for ${row.modelCode}`}
      className={cn("w-full md:w-24")}
      onChange={(event) => onQty(row.modelId, Number(event.target.value))}
    />
  );
}
