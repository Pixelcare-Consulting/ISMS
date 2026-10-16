"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  listBranchesForLogisticsAction,
  listPulloutReasonCodesAction,
  listPulloutSerialsAction,
  listWarehousesForLogisticsAction,
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
import { SearchableSelect } from "@/components/ui/searchable-select";

interface PulloutRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: {
    branchId: string;
    warehouseId: string;
    reasonStatusCodeId: string;
    serialNumberIds: string[];
  }) => Promise<{ error?: string; pulloutNo?: string }>;
  onCreated: () => void;
}

export function PulloutRequestDialog({
  open,
  onOpenChange,
  onSubmit,
  onCreated,
}: PulloutRequestDialogProps) {
  const [pending, startTransition] = useTransition();
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string; code: string }[]>([]);
  const [reasons, setReasons] = useState<{ id: string; code: string; name: string }[]>([]);
  const [serials, setSerials] = useState<
    { serialNumberId: string; serialNo: string; skuCode: string; inventoryCode: string }[]
  >([]);
  const [branchId, setBranchId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [reasonId, setReasonId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void Promise.all([
      listBranchesForLogisticsAction(),
      listWarehousesForLogisticsAction(),
      listPulloutReasonCodesAction(),
    ]).then(([branchRows, warehouseRows, reasonRows]) => {
      if (cancelled) return;
      setBranches(branchRows);
      setWarehouses(warehouseRows);
      setReasons(reasonRows.map((reason) => ({ id: reason.id, code: reason.code, name: reason.name })));
      setBranchId((current) => current || branchRows[0]?.id || "");
      setWarehouseId((current) => current || warehouseRows[0]?.id || "");
      setReasonId((current) => current || reasonRows[0]?.id || "");
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !branchId) return;
    let cancelled = false;
    void listPulloutSerialsAction(branchId).then((result) => {
      if (cancelled) return;
      if ("error" in result && result.error) {
        setSerials([]);
        toast.error(result.error);
        return;
      }
      if (!("serials" in result)) return;
      setSerials(result.serials);
      setSelected([]);
    });
    return () => {
      cancelled = true;
    };
  }, [open, branchId]);

  function submit() {
    startTransition(async () => {
      const result = await onSubmit({
        branchId,
        warehouseId,
        reasonStatusCodeId: reasonId,
        serialNumberIds: selected,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.pulloutNo ? `Pull-out ${result.pulloutNo} submitted` : "Pull-out submitted",
      );
      setSelected([]);
      onOpenChange(false);
      onCreated();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New pull-out</DialogTitle>
          <DialogDescription>
            Stock units are reserved. Defective units stay defective until the pull-out is sent.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <SearchableSelect
            label="Branch"
            options={branches.map((branch) => ({ id: branch.id, label: branch.name }))}
            value={branchId}
            onChange={setBranchId}
            placeholder="Select branch…"
            searchPlaceholder="Search branches…"
            disabled={pending}
          />
          <SearchableSelect
            label="Warehouse"
            options={warehouses.map((warehouse) => ({
              id: warehouse.id,
              label: `${warehouse.name} (${warehouse.code})`,
            }))}
            value={warehouseId}
            onChange={setWarehouseId}
            placeholder="Select warehouse…"
            searchPlaceholder="Search warehouses…"
            disabled={pending}
          />
          <SearchableSelect
            label="Pull-out reason"
            options={reasons.map((reason) => ({
              id: reason.id,
              label: `${reason.name} (${reason.code})`,
            }))}
            value={reasonId}
            onChange={setReasonId}
            placeholder="Select reason…"
            searchPlaceholder="Search reasons…"
            disabled={pending}
          />
          <div className="max-h-48 space-y-2 overflow-y-auto">
            {serials.length === 0 ? (
              <p className="text-sm text-muted-foreground">No serials are free at this branch.</p>
            ) : (
              serials.map((serial) => (
                <label
                  key={serial.serialNumberId}
                  className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
                >
                  <Checkbox
                    checked={selected.includes(serial.serialNumberId)}
                    onCheckedChange={(value) => {
                      setSelected((current) =>
                        value === true
                          ? [...current, serial.serialNumberId]
                          : current.filter((id) => id !== serial.serialNumberId),
                      );
                    }}
                    aria-label={`Select ${serial.serialNo}`}
                  />
                  <span className="font-mono">{serial.serialNo}</span>
                  <span className="text-muted-foreground">
                    {serial.skuCode} · {serial.inventoryCode}
                  </span>
                </label>
              ))
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={pending || selected.length === 0 || !warehouseId || !reasonId} onClick={submit}>
            Submit {selected.length || ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
