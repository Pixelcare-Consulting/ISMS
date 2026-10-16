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
  stockInWarehouseLocationAction,
} from "@/features/warehouses/actions/warehouse.actions";

interface StockInModel {
  id: string;
  skuCode: string;
  name: string;
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

  useEffect(() => {
    if (!open || models) return;
    let cancelled = false;
    void listModelsForWarehouseStockInAction()
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
  }, [open, models]);

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
            Choose the model and enter serial numbers for {locationName}. New
            serials are created and placed in this location.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <SearchableSelect
            label="Model"
            options={(models ?? []).map((model) => ({
              id: model.id,
              label: model.skuCode,
              description: model.name,
            }))}
            value={modelId}
            onChange={setModelId}
            placeholder={models ? "Select model…" : "Loading models…"}
            searchPlaceholder="Search models…"
            emptyMessage={modelsError ?? "No models available."}
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
              placeholder="One serial per line"
              disabled={pending}
              className="min-h-[7rem] font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Separate serials with a new line or a comma.
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
