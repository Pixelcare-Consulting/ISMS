"use client";

import { useState } from "react";
import { Search } from "lucide-react";

import type {
  DispatchCandidate,
  DispatchModelRequirement,
} from "@/features/logistics/services/delivery-posting.service";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
  const [query, setQuery] = useState("");
  // First model open; the rest stay folded so a long list does not become one long scroll.
  const [openModels, setOpenModels] = useState<string[]>(
    target.models[0] ? [target.models[0].modelId] : [],
  );
  const totalRequired = target.models.reduce((sum, model) => sum + model.requiredQty, 0);
  const needle = query.trim().toLowerCase();

  const groups = target.models.map((model) => {
    const serials = target.serials.filter((serial) => serial.modelId === model.modelId);
    const picked = serials.filter((serial) => selected.includes(serial.id)).length;
    const visible = needle
      ? serials.filter((serial) => serial.serialNo.toLowerCase().includes(needle))
      : serials;
    return { model, serials, visible, picked };
  });
  const complete =
    totalRequired > 0 && groups.every((group) => group.picked === group.model.requiredQty);
  // While searching, open every model with a match so results are never hidden.
  const accordionValue = needle
    ? groups.filter((group) => group.visible.length > 0).map((group) => group.model.modelId)
    : openModels;

  function toggle(modelId: string, serialId: string, checked: boolean) {
    const next = checked ? [...selected, serialId] : selected.filter((id) => id !== serialId);
    setSelected(next);
    if (!checked || needle) return;

    const group = groups.find((entry) => entry.model.modelId === modelId);
    if (!group || group.picked + 1 < group.model.requiredQty) return;
    // This pick completed the model: fold it and open the next one still short.
    const nextShort = groups.find(
      (entry) =>
        entry.model.modelId !== modelId &&
        entry.serials.filter((serial) => next.includes(serial.id)).length <
          entry.model.requiredQty,
    );
    setOpenModels((current) => {
      const without = current.filter((id) => id !== modelId);
      return nextShort && !without.includes(nextShort.model.modelId)
        ? [...without, nextShort.model.modelId]
        : without;
    });
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

      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search or scan a serial number"
          aria-label="Search serial numbers"
          className="h-11 pl-9"
        />
      </div>

      <div className="max-h-[50vh] overflow-y-auto rounded-md border">
        <Accordion type="multiple" value={accordionValue} onValueChange={setOpenModels}>
          {groups.map(({ model, serials, visible, picked }) => {
            const full = picked >= model.requiredQty;
            const done = picked === model.requiredQty;
            const short = serials.length < model.requiredQty;
            return (
              <AccordionItem key={model.modelId} value={model.modelId}>
                <AccordionTrigger className="min-h-11 items-center px-3 py-2 hover:bg-muted/60 hover:no-underline">
                  <span className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className="min-w-0">
                      <span className="font-mono font-medium">{model.skuCode}</span>
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {serials.length} in warehouse
                      </span>
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${
                        done
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {picked} / {model.requiredQty} picked
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-2 px-3">
                  {short ? (
                    <p className="text-xs text-destructive" role="alert">
                      Only {serials.length} in the warehouse. Stock in more before dispatching.
                    </p>
                  ) : null}
                  {visible.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {needle ? "No serial matches your search." : "No serials in the warehouse."}
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {visible.map((serial) => {
                        const checked = selected.includes(serial.id);
                        // Once a model has its count, the rest lock so nobody over-picks.
                        const locked = !checked && full;
                        return (
                          <li key={serial.id}>
                            <label
                              className={`flex min-h-11 items-center gap-3 rounded-md border px-3 py-2 text-sm ${
                                locked ? "bg-muted/40 text-muted-foreground" : ""
                              }`}
                            >
                              <Checkbox
                                checked={checked}
                                disabled={locked || pending}
                                onCheckedChange={(value) =>
                                  toggle(model.modelId, serial.id, value === true)
                                }
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
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
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
