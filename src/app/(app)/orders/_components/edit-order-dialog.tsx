"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  checkOrderWindowAction,
  listModelsForOrderAction,
  updateOrderAction,
} from "@/features/orders/actions/order.actions";
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
import { cn } from "@/utils/cn";

interface EditableLine {
  modelId: string;
  skuCode: string;
  quantity: number;
}

interface ModelOption {
  id: string;
  skuCode: string;
  name: string;
  maxQty: number | null;
}

export interface EditableOrder {
  id: string;
  orderNumber: string;
  branchId: string;
  branchName: string;
  orderType: "auto_replenish" | "manual" | "special";
  lines: EditableLine[];
}

export function EditOrderDialog({
  order,
  onClose,
  stacked = false,
}: {
  order: EditableOrder;
  onClose: () => void;
  /** Raise above an already open dialog, such as View details. */
  stacked?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [lines, setLines] = useState<EditableLine[]>(order.lines);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [addModelId, setAddModelId] = useState("");
  const [windowBlock, setWindowBlock] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [modelRows, windowRes] = await Promise.all([
        listModelsForOrderAction(order.branchId, order.orderType),
        checkOrderWindowAction(order.branchId, order.orderType),
      ]);
      if (cancelled) return;
      setModels(modelRows);
      setWindowBlock(windowRes.blocked ? windowRes.reason : null);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [order.branchId, order.orderType]);

  function setQty(modelId: string, quantity: number) {
    setLines((prev) => prev.map((l) => (l.modelId === modelId ? { ...l, quantity } : l)));
  }

  function removeLine(modelId: string) {
    setLines((prev) => prev.filter((l) => l.modelId !== modelId));
  }

  function addLine() {
    if (!addModelId) return;
    if (lines.some((l) => l.modelId === addModelId)) {
      toast.error("That SKU is already on the order");
      return;
    }
    const model = models.find((m) => m.id === addModelId);
    if (!model) return;
    setLines((prev) => [...prev, { modelId: model.id, skuCode: model.skuCode, quantity: 1 }]);
    setAddModelId("");
  }

  function submit() {
    if (lines.length === 0) {
      toast.error("Order must have at least one line");
      return;
    }
    startTransition(async () => {
      const result = await updateOrderAction(order.id, {
        details: lines.map((l) => ({ modelId: l.modelId, quantity: l.quantity })),
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        order.orderType === "manual"
          ? "Order updated — still awaiting Supply Planning"
          : "Order updated — re-submitted for review",
      );
      onClose();
      router.refresh();
    });
  }

  const availableToAdd = models.filter((m) => !lines.some((l) => l.modelId === m.id));
  const editHint =
    order.orderType === "manual"
      ? "You can adjust lines while Supply Planning reviews."
      : "Editing resubmits the order for review.";

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !pending) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        overlayClassName={stacked ? "z-[70]" : undefined}
        className={cn("max-w-lg", stacked && "z-[80]")}
      >
        <DialogHeader>
          <DialogTitle>Edit order {order.orderNumber}</DialogTitle>
          <DialogDescription>{editHint}</DialogDescription>
        </DialogHeader>

        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">Branch</p>
          <p className="mt-1.5 break-words rounded-lg bg-muted/70 px-3 py-2.5 text-sm font-medium leading-5">
            {order.branchName}
          </p>
        </div>

        {!loaded ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            {windowBlock ? (
              <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {windowBlock}
              </p>
            ) : null}

            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Lines</p>
              {lines.length === 0 ? (
                <p className="text-sm text-muted-foreground">No lines — add at least one SKU.</p>
              ) : (
                <ul className="divide-y divide-border/60" aria-label="Lines">
                  {lines.map((line) => (
                    <li
                      key={line.modelId}
                      className="grid grid-cols-[minmax(0,1fr)_4.5rem_2rem] items-center gap-x-3 py-1.5"
                    >
                      <span className="truncate text-sm font-medium" title={line.skuCode}>
                        {line.skuCode}
                      </span>
                      <Input
                        type="number"
                        min={1}
                        className="h-8 w-full rounded-lg border-transparent bg-muted px-1 text-center text-sm tabular-nums shadow-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        value={line.quantity}
                        onChange={(e) => setQty(line.modelId, Math.max(1, Number(e.target.value)))}
                        disabled={pending}
                        aria-label={`Quantity for ${line.skuCode}`}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 justify-self-end text-muted-foreground hover:text-foreground"
                        onClick={() => removeLine(line.modelId)}
                        disabled={pending}
                        aria-label={`Remove line ${line.skuCode}`}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex items-end gap-2">
              <SearchableSelect
                label="Add SKU"
                className="min-w-0 flex-1"
                options={availableToAdd.map((m) => ({
                  id: m.id,
                  label: `${m.skuCode} — ${m.name}${m.maxQty != null ? ` (Shelf max ${m.maxQty})` : ""}`,
                }))}
                popoverClassName={stacked ? "z-[100]" : undefined}
                value={addModelId}
                onChange={setAddModelId}
                placeholder="Select model…"
                searchPlaceholder="Search models…"
                emptyMessage="No eligible SKUs."
                disabled={pending}
              />
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                onClick={addLine}
                disabled={pending || !addModelId}
              >
                Add
              </Button>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={submit}
                disabled={pending || windowBlock !== null || lines.length === 0}
              >
                {pending ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
