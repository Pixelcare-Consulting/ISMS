"use client";

import { useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface LocationRow {
  id: string;
  code: string;
  name: string;
}

interface WarehouseLocationsDialogProps {
  /** The warehouse whose locations are shown; null keeps the dialog closed. */
  warehouse: { id: string; code: string; name: string; locations: LocationRow[] } | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  /** Calls `onAdded` only when the location was saved, so the inputs keep their text on error. */
  onAdd: (warehouseId: string, code: string, name: string, onAdded: () => void) => void;
  onRemove: (warehouseId: string, location: LocationRow) => void;
}

/** List, add and remove the bin or aisle locations inside one warehouse. */
export function WarehouseLocationsDialog({
  warehouse,
  pending,
  onOpenChange,
  onAdd,
  onRemove,
}: WarehouseLocationsDialogProps) {
  const [locCode, setLocCode] = useState("");
  const [locName, setLocName] = useState("");
  const canAdd = Boolean(locCode.trim() && locName.trim()) && !pending;

  function changeOpen(open: boolean) {
    if (!open) {
      setLocCode("");
      setLocName("");
    }
    onOpenChange(open);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!warehouse || !canAdd) return;
    onAdd(warehouse.id, locCode, locName, () => {
      setLocCode("");
      setLocName("");
    });
  }

  const locations = warehouse?.locations ?? [];

  return (
    <Dialog open={warehouse !== null} onOpenChange={changeOpen}>
      {/* A column that never outgrows the viewport: header and add form keep their height,
          and the list takes what is left and scrolls inside it. */}
      <DialogContent className="flex flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            Locations
            <Badge variant="secondary" className="font-normal tabular-nums">
              {locations.length}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Bins or aisles inside{" "}
            <span className="font-mono">{warehouse?.code}</span> {warehouse?.name}.
          </DialogDescription>
        </DialogHeader>

        {locations.length === 0 ? (
          <p className="shrink-0 rounded-md border border-dashed px-3 py-2.5 text-sm text-muted-foreground">
            No locations yet. Add a bin or aisle code below.
          </p>
        ) : (
          <ul
            aria-label="Locations"
            className="min-h-0 flex-1 divide-y overflow-y-auto overscroll-contain rounded-md border"
          >
            {locations.map((loc) => (
              <li key={loc.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <Badge variant="outline" className="shrink-0 font-mono text-xs font-medium">
                  {loc.code}
                </Badge>
                <span className="min-w-0 flex-1 truncate">{loc.name}</span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={pending}
                  className="size-11 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive sm:size-8"
                  aria-label={`Remove location ${loc.code}`}
                  onClick={() => warehouse && onRemove(warehouse.id, loc)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={submit} className="grid shrink-0 gap-3 border-t pt-4">
          <p className="text-sm font-medium">Add location</p>
          <div className="grid gap-3 sm:grid-cols-[7rem_1fr_auto] sm:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor="loc-code">Code</Label>
              <Input
                id="loc-code"
                placeholder="e.g. A1"
                value={locCode}
                onChange={(event) => setLocCode(event.target.value)}
                disabled={pending}
              />
            </div>
            <div className="grid min-w-0 gap-1.5">
              <Label htmlFor="loc-name">Name</Label>
              <Input
                id="loc-name"
                placeholder="e.g. Aisle 1"
                value={locName}
                onChange={(event) => setLocName(event.target.value)}
                disabled={pending}
              />
            </div>
            <Button type="submit" disabled={!canAdd}>
              <Plus className="size-4" />
              Add
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
