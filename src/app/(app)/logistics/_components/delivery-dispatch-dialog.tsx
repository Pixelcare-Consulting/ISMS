"use client";

import { useState } from "react";

import type {
  DispatchCandidate,
  DispatchModelRequirement,
} from "@/features/logistics/services/delivery-posting.service";
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

export interface DispatchTarget {
  id: string;
  deliveryNo: string;
  branchName: string;
  models: DispatchModelRequirement[];
  serials: DispatchCandidate[];
}

interface DeliveryDispatchDialogProps {
  target: DispatchTarget | null;
  pending: boolean;
  onClose: () => void;
  onConfirm: (serialNumberIds: string[]) => void;
}

/**
 * Pick the serials that physically leave the warehouse, grouped by ordered model.
 * Nothing is pre-ticked: the picked serials go to SAP on the IT/DR, so they must be
 * the units the operator actually loads.
 */
export function DeliveryDispatchDialog({
  target,
  pending,
  onClose,
  onConfirm,
}: DeliveryDispatchDialogProps) {
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        {target ? (
          // Keyed so each delivery starts with an empty selection.
          <DispatchBody
            key={target.id}
            target={target}
            pending={pending}
            onClose={onClose}
            onConfirm={onConfirm}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DispatchBody({
  target,
  pending,
  onClose,
  onConfirm,
}: DeliveryDispatchDialogProps & { target: DispatchTarget }) {
  const [selected, setSelected] = useState<string[]>([]);
  const totalRequired = target.models.reduce((sum, model) => sum + model.requiredQty, 0);

  const groups = target.models.map((model) => {
    const serials = target.serials.filter((serial) => serial.modelId === model.modelId);
    const picked = serials.filter((serial) => selected.includes(serial.id)).length;
    return { model, serials, picked };
  });
  const complete =
    totalRequired > 0 && groups.every((group) => group.picked === group.model.requiredQty);

  function toggle(serialId: string, checked: boolean) {
    setSelected((current) =>
      checked ? [...current, serialId] : current.filter((id) => id !== serialId),
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Dispatch {target.deliveryNo}</DialogTitle>
        <DialogDescription>
          Tick the serials you are loading for {target.branchName}. Dispatch moves them into
          transit and posts them to SAP.
        </DialogDescription>
      </DialogHeader>

      <div className="max-h-96 space-y-4 overflow-y-auto">
        {groups.map(({ model, serials, picked }) => {
          const full = picked >= model.requiredQty;
          const short = serials.length < model.requiredQty;
          return (
            <section key={model.modelId} className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-medium">
                  {model.skuCode}: pick {model.requiredQty} of {serials.length}
                </h3>
                <span
                  className={`text-xs tabular-nums ${
                    picked === model.requiredQty ? "text-emerald-700" : "text-muted-foreground"
                  }`}
                >
                  {picked} / {model.requiredQty} picked
                </span>
              </div>
              {short ? (
                <p className="text-xs text-destructive" role="alert">
                  Only {serials.length} in the warehouse. Stock in more before dispatching.
                </p>
              ) : null}
              {serials.length === 0 ? null : (
                <ul className="space-y-2">
                  {serials.map((serial) => {
                    const checked = selected.includes(serial.id);
                    // Once a model has its count, the rest lock so nobody over-picks.
                    const locked = !checked && full;
                    return (
                      <li key={serial.id}>
                        <label
                          className={`flex min-h-11 items-center gap-3 rounded-md border px-3 py-2 text-sm ${
                            locked ? "opacity-60" : ""
                          }`}
                        >
                          <Checkbox
                            checked={checked}
                            disabled={locked || pending}
                            onCheckedChange={(value) => toggle(serial.id, value === true)}
                            aria-label={`Dispatch ${serial.serialNo}`}
                          />
                          <span className="font-mono">{serial.serialNo}</span>
                          <span className="text-muted-foreground">
                            {serial.warehouseCode} / {serial.locationCode}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <DialogFooter>
        <Button variant="outline" disabled={pending} onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={pending || !complete} onClick={() => onConfirm(selected)}>
          Dispatch {selected.length} of {totalRequired}
        </Button>
      </DialogFooter>
    </>
  );
}
