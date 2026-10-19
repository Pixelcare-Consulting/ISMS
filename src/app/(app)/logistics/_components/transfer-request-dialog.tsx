"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  listBranchesForLogisticsAction,
  listTransferModelsAction,
  listTransferSerialsAction,
} from "@/features/logistics/actions/logistics.actions";
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
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";

interface TransferRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: {
    fromBranchId: string;
    toBranchId: string;
    modelId: string;
    quantity: number;
    serialNumberIds: string[];
    notes?: string;
  }) => Promise<{ error?: string; transferNo?: string }>;
  onCreated: () => void;
}

export function TransferRequestDialog({
  open,
  onOpenChange,
  onSubmit,
  onCreated,
}: TransferRequestDialogProps) {
  const [pending, startTransition] = useTransition();
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [models, setModels] = useState<{ id: string; skuCode: string; name: string }[]>([]);
  const [serialSnapshot, setSerialSnapshot] = useState<{
    source: string;
    serials: { serialNumberId: string; serialNo: string; skuCode: string; inventoryCode: string }[];
    selected: string[];
  }>({ source: "", serials: [], selected: [] });
  const [fromBranchId, setFromBranchId] = useState("");
  const [toBranchId, setToBranchId] = useState("");
  const [modelId, setModelId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const serialSource = open && fromBranchId && modelId ? `${fromBranchId}:${modelId}` : "";
  const serials = serialSnapshot.source === serialSource ? serialSnapshot.serials : [];
  const selected = serialSnapshot.source === serialSource ? serialSnapshot.selected : [];

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void listBranchesForLogisticsAction().then((rows) => {
      if (cancelled) return;
      setBranches(rows);
      setFromBranchId((current) => current || rows[0]?.id || "");
      setToBranchId((current) => current || rows[1]?.id || rows[0]?.id || "");
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !fromBranchId) return;
    let cancelled = false;
    void listTransferModelsAction(fromBranchId).then((result) => {
      if (cancelled) return;
      if ("error" in result && result.error) {
        setModels([]);
        toast.error(result.error);
        return;
      }
      if (!("models" in result)) return;
      setModels(result.models);
      setModelId((current) =>
        result.models.some((model) => model.id === current)
          ? current
          : (result.models[0]?.id ?? ""),
      );
      if (result.models.length === 0) setQuantity(0);
    });
    return () => {
      cancelled = true;
    };
  }, [open, fromBranchId]);

  useEffect(() => {
    if (!open || !fromBranchId || !modelId) return;
    const source = `${fromBranchId}:${modelId}`;
    let cancelled = false;
    void listTransferSerialsAction(fromBranchId, modelId).then((result) => {
      if (cancelled) return;
      if ("error" in result && result.error) {
        setSerialSnapshot({ source, serials: [], selected: [] });
        toast.error(result.error);
        return;
      }
      if (!("serials" in result)) return;
      setSerialSnapshot({ source, serials: result.serials, selected: [] });
      setQuantity(result.serials.length > 0 ? 1 : 0);
    });
    return () => {
      cancelled = true;
    };
  }, [open, fromBranchId, modelId]);

  function submit() {
    startTransition(async () => {
      const result = await onSubmit({
        fromBranchId,
        toBranchId,
        modelId,
        quantity,
        serialNumberIds: selected,
        notes: notes.trim() || undefined,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.transferNo ? `Transfer ${result.transferNo} submitted` : "Transfer submitted",
      );
      setNotes("");
      setSerialSnapshot((current) => ({ ...current, selected: [] }));
      onOpenChange(false);
      onCreated();
    });
  }

  const ready = selected.length > 0 && selected.length === quantity && fromBranchId !== toBranchId;

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New transfer request</DialogTitle>
          <DialogDescription>
            Choose the releasing branch, the receiving branch, and the exact serials. Quantity must
            match the serials you tick. Those units are reserved until Team Lead decides.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <SearchableSelect
            label="Releasing branch"
            options={branches.map((branch) => ({ id: branch.id, label: branch.name }))}
            value={fromBranchId}
            onChange={(next) => {
              setFromBranchId(next);
              setModelId("");
              setQuantity(0);
            }}
            placeholder="Select branch…"
            searchPlaceholder="Search branches…"
            disabled={pending}
          />
          <SearchableSelect
            label="Receiving branch"
            options={branches.map((branch) => ({ id: branch.id, label: branch.name }))}
            value={toBranchId}
            onChange={setToBranchId}
            placeholder="Select branch…"
            searchPlaceholder="Search branches…"
            disabled={pending}
          />
          <SearchableSelect
            label="Model"
            options={models.map((model) => ({
              id: model.id,
              label: `${model.skuCode} — ${model.name}`,
            }))}
            value={modelId}
            onChange={(next) => {
              setModelId(next);
              setQuantity(next ? 1 : 0);
            }}
            placeholder="Select model…"
            searchPlaceholder="Search models…"
            disabled={pending || models.length === 0}
          />
          <div className="space-y-1">
            <Label htmlFor="transfer-quantity">Quantity</Label>
            <Input
              id="transfer-quantity"
              type="number"
              min={1}
              value={quantity || ""}
              disabled={pending}
              onChange={(event) => setQuantity(Number(event.target.value))}
            />
          </div>
          <div className="max-h-48 space-y-2 overflow-y-auto">
            {serials.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No stock or defective serials are free for this model.
              </p>
            ) : (
              serials.map((serial) => (
                <label
                  key={serial.serialNumberId}
                  className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
                >
                  <Checkbox
                    checked={selected.includes(serial.serialNumberId)}
                    onCheckedChange={(value) => {
                      setSerialSnapshot((current) => {
                        const currentSelected =
                          current.source === serialSource ? current.selected : [];
                        return {
                          source: serialSource,
                          serials: current.source === serialSource ? current.serials : [],
                          selected:
                            value === true
                              ? [...currentSelected, serial.serialNumberId]
                              : currentSelected.filter((id) => id !== serial.serialNumberId),
                        };
                      });
                    }}
                    aria-label={`Select ${serial.serialNo}`}
                  />
                  <span className="font-mono">{serial.serialNo}</span>
                  <span className="text-muted-foreground">{serial.inventoryCode}</span>
                </label>
              ))
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="transfer-reason">Reason</Label>
            <Textarea
              id="transfer-reason"
              value={notes}
              disabled={pending}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Why these units are moving"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={pending || !ready} onClick={submit}>
            Submit {selected.length || ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
