"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { createPriceListAction } from "@/features/master-data/actions/master-data.actions";
import type { ClientModelPriceListRow, ClientModelRow } from "@/features/master-data/types/client-model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatPeso } from "@/utils/format-currency";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface ModelPriceSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model: ClientModelRow;
  packageTypes: { id: string; name: string }[];
}

export function ModelPriceSheet({
  open,
  onOpenChange,
  model,
  packageTypes,
}: ModelPriceSheetProps) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [periodStart, setPeriodStart] = useState(todayIso());
  const [periodEnd, setPeriodEnd] = useState("");
  const [packageTypeId, setPackageTypeId] = useState("");
  const [historyId, setHistoryId] = useState("");
  const [pending, startTransition] = useTransition();

  const historyOptions = model.priceLists.map((row) => ({
    id: row.id,
    label: `${formatPeso(row.amount)}${row.packageType ? ` · ${row.packageType.name}` : ""}`,
    description: `${row.periodStart} → ${row.periodEnd}`,
  }));

  function resetForm() {
    setAmount("");
    setPeriodStart(todayIso());
    setPeriodEnd("");
    setPackageTypeId("");
    setHistoryId("");
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) resetForm();
  }

  function applyHistoryRow(row: ClientModelPriceListRow) {
    setHistoryId(row.id);
    setAmount(String(row.amount));
    setPackageTypeId(row.packageTypeId ?? "");

    // Keep the row's period length, but shift it to start today so the new
    // entry is valid and active immediately (the reused row's own dates may
    // be in the past).
    const start = new Date(row.periodStart);
    const end = new Date(row.periodEnd);
    const durationMs = Math.max(0, end.getTime() - start.getTime());
    const newStart = new Date();
    const newEnd = new Date(newStart.getTime() + durationMs);

    setPeriodStart(newStart.toISOString().slice(0, 10));
    setPeriodEnd(newEnd.toISOString().slice(0, 10));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createPriceListAction({
        modelId: model.id,
        amount: Number(amount),
        periodStart,
        periodEnd,
        packageTypeId: packageTypeId || null,
      });
      if (result.error) {
        toast.error(String(result.error));
        return;
      }
      toast.success("Price updated");
      handleOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-border/60 px-4 py-4 text-left">
          <SheetTitle className="font-mono">{model.skuCode}</SheetTitle>
          <SheetDescription>
            {model.name} — current price{" "}
            {model.effectivePrice != null ? formatPeso(model.effectivePrice) : "not available"}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {model.priceLists.length > 0 ? (
              <SearchableSelect
                label="Reuse a previous price list"
                id="model-price-history"
                options={historyOptions}
                value={historyId}
                onChange={(id) => {
                  const row = model.priceLists.find((r) => r.id === id);
                  if (row) applyHistoryRow(row);
                }}
                placeholder="Select a previous entry…"
                searchPlaceholder="Search previous prices…"
                disabled={pending}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                No previous price lists for this model yet.
              </p>
            )}

            <div className="space-y-2 border-t border-border/60 pt-4">
              <Label htmlFor="model-price-amount">New price</Label>
              <Input
                id="model-price-amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="model-price-start">Start</Label>
                <Input
                  id="model-price-start"
                  type="date"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="model-price-end">End</Label>
                <Input
                  id="model-price-end"
                  type="date"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  required
                />
              </div>
            </div>
            <SearchableSelect
              label="Package type"
              id="model-price-package"
              options={packageTypes.map((pkg) => ({ id: pkg.id, label: pkg.name }))}
              value={packageTypeId}
              onChange={setPackageTypeId}
              allowClear
              placeholder="—"
              searchPlaceholder="Search package types…"
              disabled={pending}
            />
          </div>
          <SheetFooter className="border-t border-border/60">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !amount || !periodStart || !periodEnd}>
              Apply price
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
