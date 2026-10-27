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
import { LoadingModal } from "@/components/ui/loading-modal";

export interface DispatchTarget {
  id: string;
  deliveryNo: string;
  branchName: string;
  models: DispatchModelRequirement[];
  serials: DispatchCandidate[];
}

const DISPATCH_FEED = [
  { atSecond: 0, label: "Checking the picked serials", hint: "Making sure each one is still available." },
  { atSecond: 1, label: "Posting the IT / DR to SAP", hint: "This can take a few seconds." },
  { atSecond: 3, label: "Moving units into transit", hint: "Taking them off their locations." },
  { atSecond: 4, label: "Refreshing deliveries" },
];

/** Shown while a confirmed dispatch posts to SAP and moves the units. */
export function DispatchingModal({ open, deliveryNo }: { open: boolean; deliveryNo?: string }) {
  return (
    <LoadingModal
      open={open}
      title={deliveryNo ? `Dispatching ${deliveryNo}` : "Dispatching"}
      description="Posting to SAP and moving the units. Please keep this page open."
      feedItems={DISPATCH_FEED}
    />
  );
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
      <DialogContent className="sm:max-w-2xl">
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
      ? serials.filter(
          (serial) =>
            serial.serialNo.toLowerCase().includes(needle) ||
            (serial.locationCode ?? "").toLowerCase().includes(needle),
        )
      : serials;
    return { model, serials, visible, picked };
  });
  const complete =
    totalRequired > 0 && groups.every((group) => group.picked === group.model.requiredQty);
  // While searching, open every model with a match so results are never hidden.
  const accordionValue = needle
    ? groups.filter((group) => group.visible.length > 0).map((group) => group.model.modelId)
    : openModels;

  // A completed model stays open: folding it hid the picks people wanted to check or swap.
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

      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search or scan a serial, or type a location"
          aria-label="Search serial numbers or locations"
          className="h-11 pl-9"
        />
      </div>

      <div className="max-h-[55vh] overflow-y-auto pr-1">
        <Accordion
          type="multiple"
          value={accordionValue}
          onValueChange={setOpenModels}
          className="space-y-3"
        >
          {groups.map(({ model, serials, visible, picked }) => {
            const full = picked >= model.requiredQty;
            const done = picked === model.requiredQty;
            const short = serials.length < model.requiredQty;
            return (
              <AccordionItem
                key={model.modelId}
                value={model.modelId}
                className={`overflow-hidden rounded-lg border last:border-b ${
                  done ? "border-emerald-300 dark:border-emerald-800" : ""
                }`}
              >
                {/* Level 1: the model and what dispatch still needs from it. */}
                <AccordionTrigger className="min-h-14 items-center rounded-none bg-muted/50 px-4 py-3 hover:bg-muted hover:no-underline">
                  <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block font-mono text-sm font-semibold">{model.skuCode}</span>
                      <span className="block truncate text-xs font-normal text-muted-foreground">
                        {model.modelName} · {serials.length} available
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums ${
                        done
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                          : "bg-background text-foreground ring-1 ring-border"
                      }`}
                    >
                      {done ? "Done · " : ""}
                      {picked} of {model.requiredQty} picked
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="px-4 pt-3">
                  {short ? (
                    <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
                      Only {serials.length} available, {model.requiredQty} needed. Sync serial numbers
                      from SAP if the warehouse has received more.
                    </p>
                  ) : null}
                  {visible.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {needle ? "No serial or location matches your search." : "No serials available."}
                    </p>
                  ) : (
                    <div className="divide-y">
                      {groupByLocation(visible).map((location) => {
                        const pickedHere = location.serials.filter((serial) =>
                          selected.includes(serial.id),
                        ).length;
                        return (
                          // Level 2: the shelf location.
                          <section
                            key={location.key}
                            aria-label={`Location ${location.label}`}
                            className="py-3 first:pt-0 last:pb-0"
                          >
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold text-primary">
                                  {location.locationCode ?? "No location"}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {location.warehouseCode}
                                </span>
                              </div>
                              <span className="text-xs tabular-nums text-muted-foreground">
                                {pickedHere > 0 ? `${pickedHere} picked of ` : ""}
                                {location.serials.length} here
                              </span>
                            </div>
                            {/* Level 3: the serials on that shelf. */}
                            <ul className="grid gap-2 sm:grid-cols-2">
                              {location.serials.map((serial) => {
                                const checked = selected.includes(serial.id);
                                // Once a model has its count, the rest lock so nobody over-picks.
                                const locked = !checked && full;
                                return (
                                  <li key={serial.id}>
                                    <label
                                      className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors ${
                                        checked
                                          ? "border-primary bg-primary/5"
                                          : locked
                                            ? "cursor-not-allowed bg-muted/40 text-muted-foreground"
                                            : "hover:border-foreground/30 hover:bg-muted/40"
                                      }`}
                                    >
                                      <Checkbox
                                        checked={checked}
                                        disabled={locked || pending}
                                        onCheckedChange={(value) => toggle(serial.id, value === true)}
                                        aria-label={`Dispatch ${serial.serialNo} from ${location.label}`}
                                      />
                                      <span className="min-w-0">
                                        <span className="block font-mono text-sm">{serial.serialNo}</span>
                                        {serial.heldBy ? (
                                          <span className="block truncate text-xs text-muted-foreground">
                                            {serial.heldBy}
                                          </span>
                                        ) : null}
                                      </span>
                                    </label>
                                  </li>
                                );
                              })}
                            </ul>
                          </section>
                        );
                      })}
                    </div>
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

interface LocationGroup {
  key: string;
  label: string;
  warehouseCode: string;
  /** Null for serials SAP places in the warehouse with no ISMS location. */
  locationCode: string | null;
  serials: DispatchCandidate[];
}

/**
 * Serials under their shelf location, locations in code order, so pickers walk aisle by
 * aisle. Serials with no ISMS location (in the warehouse per SAP) come last, as one group.
 */
function groupByLocation(serials: DispatchCandidate[]): LocationGroup[] {
  const groups = new Map<string, LocationGroup>();
  for (const serial of serials) {
    const key = `${serial.warehouseCode}/${serial.locationCode ?? ""}`;
    const group = groups.get(key) ?? {
      key,
      label: serial.locationCode
        ? `${serial.warehouseCode} / ${serial.locationCode}`
        : `${serial.warehouseCode} (per SAP)`,
      warehouseCode: serial.warehouseCode,
      locationCode: serial.locationCode,
      serials: [],
    };
    group.serials.push(serial);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => {
    if (a.locationCode === null || b.locationCode === null) {
      return a.locationCode === b.locationCode ? 0 : a.locationCode === null ? 1 : -1;
    }
    return a.locationCode.localeCompare(b.locationCode, undefined, { numeric: true });
  });
}
