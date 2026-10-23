"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import {
  listModelsForWarehouseStockInAction,
  listSerialsForWarehouseStockInAction,
  stockInWarehouseLocationAction,
} from "@/features/warehouses/actions/warehouse.actions";

interface StockInModel {
  id: string;
  skuCode: string;
  name: string;
  untaggedCount: number;
}

interface WarehouseStockInDialogProps {
  open: boolean;
  warehouseId: string;
  locationCode: string;
  locationName: string;
  locationId: string;
  onOpenChange: (open: boolean) => void;
}

export function WarehouseStockInDialog({
  open,
  warehouseId,
  locationCode,
  locationName,
  locationId,
  onOpenChange,
}: WarehouseStockInDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [models, setModels] = useState<StockInModel[] | null>(null);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [modelId, setModelId] = useState("");
  const [serials, setSerials] = useState("");
  const [loadingSerials, setLoadingSerials] = useState(false);

  useEffect(() => {
    if (!open || models) return;
    let cancelled = false;
    void listModelsForWarehouseStockInAction(warehouseId)
      .then((result) => {
        if (cancelled) return;
        setModels(result.models);
      })
      .catch(() => {
        if (cancelled) return;
        setModelsError("Could not load models.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, models, warehouseId]);

  function selectModel(nextModelId: string) {
    setModelId(nextModelId);
    setSerials("");
    if (!nextModelId) return;
    setLoadingSerials(true);
    void listSerialsForWarehouseStockInAction(warehouseId, nextModelId)
      .then((result) => setSerials(result.serialNos.join("\n")))
      .catch(() => toast.error("Could not load the serials for this model."))
      .finally(() => setLoadingSerials(false));
  }

  function submit() {
    startTransition(async () => {
      const result = await stockInWarehouseLocationAction({
        warehouseId,
        locationId,
        modelId,
        serials,
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      setModelId("");
      setSerials("");
      // Counts changed; reload the model list next time the dialog opens.
      setModels(null);
      onOpenChange(false);
      router.refresh();
    });
  }

  const canSubmit = Boolean(modelId && serials.trim()) && !pending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Stock in to {locationCode}</DialogTitle>
          <DialogDescription>
            Put branch stock on a shelf in {locationName}. Models and serials come from the
            branches that use this warehouse, and only serials without a location are listed.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <SearchableSelect
            label="Model"
            options={(models ?? []).map((model) => ({
              id: model.id,
              label: model.skuCode,
              description: `${model.name} · ${model.untaggedCount} without a location`,
            }))}
            value={modelId}
            onChange={selectModel}
            placeholder={models ? "Select model…" : "Loading models…"}
            searchPlaceholder="Search models…"
            emptyMessage={
              modelsError ??
              "No unlocated stock. Branches using this warehouse as primary have nothing left to place."
            }
            disabled={pending || !models}
            popoverClassName="z-70"
          />
          {modelsError ? (
            <p className="text-sm text-destructive">{modelsError}</p>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor={`stock-in-serials-${locationId}`}>Serial numbers</Label>
            <Textarea
              id={`stock-in-serials-${locationId}`}
              value={serials}
              onChange={(event) => setSerials(event.target.value)}
              placeholder={loadingSerials ? "Loading serials…" : "One serial per line"}
              disabled={pending || loadingSerials}
              className="min-h-[7rem] font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {modelId && !loadingSerials
                ? `${serials.split("\n").filter((line) => line.trim()).length} serial(s) listed. Remove any you are not placing here.`
                : "Separate serials with a new line or a comma."}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={!canSubmit}>
            {pending ? "Stocking in…" : "Stock in"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
