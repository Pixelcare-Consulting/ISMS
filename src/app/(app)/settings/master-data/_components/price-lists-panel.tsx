"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Plus } from "lucide-react";
import { toast } from "sonner";

import {
  createPriceListAction,
  deletePriceListAction,
} from "@/features/master-data/actions/master-data.actions";
import {
  PriceListCard,
  type PriceListCardRow,
  type PriceListModelGroup,
} from "@/app/(app)/settings/master-data/_components/price-list-card";
import { PriceListHistorySheet } from "@/app/(app)/settings/master-data/_components/price-list-history-sheet";
import { DeleteConfirmDialog } from "@/components/data-table/delete-confirm-dialog";
import { TableSearchToolbar, uniqueSearchSuggestions } from "@/components/data-table/table-search-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { matchesTableSearch } from "@/utils/match-table-search";

interface PriceListsPanelProps {
  initialRows: PriceListCardRow[];
  models: { id: string; skuCode: string; name: string }[];
  packageTypes: { id: string; name: string }[];
}

function groupByModel(rows: PriceListCardRow[]): PriceListModelGroup[] {
  const map = new Map<string, PriceListModelGroup>();

  for (const row of rows) {
    const existing = map.get(row.model.id);
    if (!existing) {
      map.set(row.model.id, {
        modelId: row.model.id,
        skuCode: row.model.skuCode,
        name: row.model.name,
        latest: row,
        periodCount: 1,
      });
      continue;
    }
    existing.periodCount += 1;
    // Rows arrive periodStart desc; keep first as latest
  }

  return Array.from(map.values());
}

export function PriceListsPanel({
  initialRows,
  models,
  packageTypes,
}: PriceListsPanelProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [historyModelId, setHistoryModelId] = useState<string | null>(null);
  const [modelId, setModelId] = useState(models[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [packageTypeId, setPackageTypeId] = useState("");
  const [deleting, setDeleting] = useState<PriceListCardRow | null>(null);
  const [pending, startTransition] = useTransition();

  const modelGroups = useMemo(() => groupByModel(initialRows), [initialRows]);

  const filteredGroups = useMemo(
    () =>
      modelGroups.filter((group) =>
        matchesTableSearch(query, [
          group.skuCode,
          group.name,
          group.latest.packageType?.name ?? "",
          String(group.latest.amount),
          group.latest.periodStart,
          group.latest.periodEnd,
          String(group.periodCount),
        ]),
      ),
    [query, modelGroups],
  );

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        modelGroups.map((group) => group.skuCode),
        modelGroups.map((group) => group.name),
        modelGroups.map((group) => group.latest.packageType?.name),
        modelGroups.map((group) => String(group.latest.amount)),
      ),
    [modelGroups],
  );

  const historyRows = useMemo(() => {
    if (!historyModelId) return [];
    return initialRows.filter((row) => row.model.id === historyModelId);
  }, [historyModelId, initialRows]);

  const historyMeta = useMemo(() => {
    if (!historyModelId) return null;
    const fromRows = initialRows.find((row) => row.model.id === historyModelId);
    if (fromRows) {
      return { skuCode: fromRows.model.skuCode, name: fromRows.model.name };
    }
    const fromModels = models.find((model) => model.id === historyModelId);
    if (fromModels) {
      return { skuCode: fromModels.skuCode, name: fromModels.name };
    }
    return null;
  }, [historyModelId, initialRows, models]);

  function resetAddForm() {
    setModelId(models[0]?.id ?? "");
    setAmount("");
    setPeriodStart("");
    setPeriodEnd("");
    setPackageTypeId("");
  }

  function onAddOpenChange(open: boolean) {
    setAddOpen(open);
    if (!open) resetAddForm();
  }

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createPriceListAction({
        modelId,
        amount: Number(amount),
        periodStart,
        periodEnd,
        packageTypeId: packageTypeId || null,
      });
      if (result.error) {
        toast.error(String(result.error));
        return;
      }

      toast.success("Price list row added");
      onAddOpenChange(false);
      router.refresh();
    });
  }

  function handleDeleteConfirm() {
    if (!deleting) return;
    const { id } = deleting;

    startTransition(async () => {
      const result = await deletePriceListAction(id);
      if (result.error) {
        toast.error(String(result.error));
        return;
      }
      toast.success("Price row removed");
      setDeleting(null);
      router.refresh();
    });
  }

  return (
    <>
      <div className="space-y-4">
        <TableSearchToolbar
          value={query}
          onChange={setQuery}
          placeholder="Search by SKU, model, package type, amount…"
          suggestions={suggestions}
        >
          <Button
            type="button"
            size="sm"
            disabled={models.length === 0}
            onClick={() => setAddOpen(true)}
          >
            <Plus className="size-3.5" />
            Add price row
          </Button>
        </TableSearchToolbar>

        {initialRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/80 px-6 py-14 text-center">
            <p className="text-sm text-muted-foreground">
              {models.length === 0
                ? "Add product models first, then create price list rows."
                : "No price list rows yet. Use Add price row to create one."}
            </p>
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="rounded-xl border border-border/60 px-6 py-12 text-center text-sm text-muted-foreground">
            No price rows match your search.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredGroups.map((group) => (
              <PriceListCard
                key={group.modelId}
                group={group}
                onOpen={() => setHistoryModelId(group.modelId)}
              />
            ))}
          </div>
        )}
      </div>

      <Sheet open={addOpen} onOpenChange={onAddOpenChange}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
        >
          <SheetHeader className="border-b border-border/60 px-4 py-4 text-left">
            <SheetTitle>Add price row</SheetTitle>
            <SheetDescription>
              Create a period-based SRP for a model and optional package type.
            </SheetDescription>
          </SheetHeader>
          <form
            onSubmit={handleCreate}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="price-model">Model</Label>
                <select
                  id="price-model"
                  className="flex h-9 w-full cursor-pointer rounded-md border border-input bg-background px-2 text-sm"
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                  required
                >
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.skuCode} — {model.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="price-amount">Amount</Label>
                <Input
                  id="price-amount"
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
                  <Label htmlFor="price-start">Start</Label>
                  <Input
                    id="price-start"
                    type="date"
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="price-end">End</Label>
                  <Input
                    id="price-end"
                    type="date"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="price-package">Package type</Label>
                <select
                  id="price-package"
                  className="flex h-9 w-full cursor-pointer rounded-md border border-input bg-background px-2 text-sm"
                  value={packageTypeId}
                  onChange={(e) => setPackageTypeId(e.target.value)}
                >
                  <option value="">—</option>
                  {packageTypes.map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <SheetFooter className="border-t border-border/60">
              <Button
                type="button"
                variant="outline"
                onClick={() => onAddOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  pending || !modelId || !amount || !periodStart || !periodEnd
                }
              >
                Add price row
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {historyModelId && historyMeta ? (
        <PriceListHistorySheet
          open
          onOpenChange={(open) => {
            if (!open) setHistoryModelId(null);
          }}
          skuCode={historyMeta.skuCode}
          modelName={historyMeta.name}
          rows={historyRows}
          onDelete={(row) => setDeleting(row)}
        />
      ) : null}

      {deleting ? (
        <DeleteConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setDeleting(null);
          }}
          title="Remove price row?"
          description={`Remove price row for ${deleting.model.skuCode} (${deleting.periodStart} → ${deleting.periodEnd})?`}
          confirmLabel="Remove"
          pending={pending}
          onConfirm={handleDeleteConfirm}
        />
      ) : null}
    </>
  );
}
