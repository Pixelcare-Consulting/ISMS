"use client";

import { useMemo, useState } from "react";

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
import { MAX_RENDERED_OPTIONS } from "@/components/ui/searchable-select";
import { cn } from "@/utils/cn";

export interface AdditionalItemChoice {
  id: string;
  skuCode: string;
  name: string;
  brandName: string | null;
}

export function AdditionalItemDialog({
  open,
  onOpenChange,
  models,
  stacked = false,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  models: readonly AdditionalItemChoice[];
  stacked?: boolean;
  onAdd: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return models;
    return models.filter((model) => {
      const haystack = `${model.skuCode} ${model.name} ${model.brandName ?? ""}`.toLowerCase();
      return haystack.includes(search);
    });
  }, [models, query]);

  const visible = filtered.slice(0, MAX_RENDERED_OPTIONS);
  const hiddenCount = filtered.length - visible.length;

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  function confirm() {
    if (selected.length === 0) return;
    onAdd(selected);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName={stacked ? "z-[90]" : "z-[75]"}
        className={cn(
          "z-[75] flex max-h-[min(36rem,calc(100svh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg",
          stacked && "z-[90]",
        )}
      >
        <DialogHeader className="shrink-0 space-y-1 border-b px-4 py-4 text-left sm:px-5">
          <DialogTitle>Additional item</DialogTitle>
          <DialogDescription>
            Search active models that are not already on this order. Adding one does not change the
            branch shelf plan.
          </DialogDescription>
        </DialogHeader>
        <div className="shrink-0 px-4 pt-3 sm:px-5">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search model code or name"
            aria-label="Search models to add"
            className="h-9"
            autoFocus
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 sm:px-3">
          {models.length === 0 ? (
            <p className="px-2 py-6 text-sm text-muted-foreground">No more active models to add.</p>
          ) : visible.length === 0 ? (
            <p className="px-2 py-6 text-sm text-muted-foreground">No models match that search.</p>
          ) : (
            <ul className="space-y-0.5">
              {visible.map((model) => {
                const checked = selected.includes(model.id);
                return (
                  <li key={model.id}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/60">
                      <Checkbox
                        className="mt-0.5"
                        checked={checked}
                        onCheckedChange={() => toggle(model.id)}
                        aria-label={`Select ${model.skuCode}`}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{model.skuCode}</span>
                        <span className="block text-sm text-muted-foreground">
                          {model.name}
                          {model.brandName ? ` · ${model.brandName}` : ""}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {hiddenCount > 0 ? (
            <p className="px-2 pt-2 text-xs text-muted-foreground">
              Keep typing to narrow the list. {hiddenCount} more match.
            </p>
          ) : null}
        </div>
        <DialogFooter className="shrink-0 border-t px-4 py-4 sm:px-5">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={selected.length === 0} onClick={confirm}>
            {selected.length === 0 ? "Add" : `Add ${selected.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
