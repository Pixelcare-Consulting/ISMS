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
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";

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
}: {
  order: EditableOrder;
  onClose: () => void;
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
      toast.success("Order updated — re-submitted for review");
      onClose();
      router.refresh();
    });
  }

  const availableToAdd = models.filter((m) => !lines.some((l) => l.modelId === m.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md max-h-[calc(100svh-2rem)] overflow-y-auto space-y-4 rounded-xl border bg-card p-4 sm:p-6 shadow-lg">
        <div>
          <h3 className="font-medium">Edit order {order.orderNumber}</h3>
          <p className="text-sm text-muted-foreground">
            {order.branchName} — editing resubmits the order for review.
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

            <div className="space-y-2">
              <Label>Lines</Label>
              {lines.length === 0 ? (
                <p className="text-sm text-muted-foreground">No lines — add at least one SKU.</p>
              ) : (
                lines.map((line) => (
                  <div key={line.modelId} className="flex items-center gap-2">
                    <span className="flex-1 truncate font-mono text-sm">{line.skuCode}</span>
                    <input
                      type="number"
                      min={1}
                      className="h-9 w-20 rounded-md border px-2 text-sm"
                      value={line.quantity}
                      onChange={(e) => setQty(line.modelId, Math.max(1, Number(e.target.value)))}
                      disabled={pending}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeLine(line.modelId)}
                      disabled={pending}
                      aria-label={`Remove ${line.skuCode}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-end gap-2">
              <div className="flex-1">
                <SearchableSelect
                  label="Add SKU"
                  options={availableToAdd.map((m) => ({
                    id: m.id,
                    label: `${m.skuCode} — ${m.name}${m.maxQty != null ? ` (max ${m.maxQty})` : ""}`,
                  }))}
                  value={addModelId}
                  onChange={setAddModelId}
                  placeholder="Select model…"
                  searchPlaceholder="Search models…"
                  emptyMessage="No eligible SKUs."
                  disabled={pending}
                />
              </div>
              <Button variant="outline" onClick={addLine} disabled={pending || !addModelId}>
                Add
              </Button>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={pending}>
                Cancel
              </Button>
              <Button
                onClick={submit}
                disabled={pending || windowBlock !== null || lines.length === 0}
              >
                {pending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
