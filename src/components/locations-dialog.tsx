"use client";

import { useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  duplicateLocationCodeMessage,
  sameLocationCode,
} from "@/utils/location-code";

export interface LocationRow {
  id: string;
  code: string;
  name: string;
  isDefault?: boolean;
}

interface LocationsDialogProps {
  /** The warehouse or service center whose locations are shown; null keeps the dialog closed. */
  owner: { id: string; code: string; name: string; locations: LocationRow[] } | null;
  /** What holds the locations, for the copy: "warehouse", "service center". */
  ownerNoun: string;
  /** Opens the description, e.g. "Bins or aisles inside". */
  descriptionLead: string;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  /** Calls `onAdded` only when the location was saved, so the inputs keep their text on error. */
  onAdd: (ownerId: string, code: string, name: string, onAdded: () => void) => void;
  onRemove: (ownerId: string, location: LocationRow) => void;
  /** Shows a "Set as default" tick per location. Service centers have no default location. */
  onSetDefault?: (ownerId: string, location: LocationRow, isDefault: boolean) => void;
}

/** List, add and remove the locations inside one warehouse or service center. */
export function LocationsDialog({
  owner,
  ownerNoun,
  descriptionLead,
  pending,
  onOpenChange,
  onAdd,
  onRemove,
  onSetDefault,
}: LocationsDialogProps) {
  const [locCode, setLocCode] = useState("");
  const [locName, setLocName] = useState("");
  const locations = owner?.locations ?? [];
  const duplicate =
    locCode.trim() !== "" && locations.some((location) => sameLocationCode(location.code, locCode));
  const canAdd = Boolean(locCode.trim() && locName.trim()) && !duplicate && !pending;

  function changeOpen(open: boolean) {
    if (!open) {
      setLocCode("");
      setLocName("");
    }
    onOpenChange(open);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!owner || !canAdd) return;
    onAdd(owner.id, locCode, locName, () => {
      setLocCode("");
      setLocName("");
    });
  }

  return (
    <Dialog open={owner !== null} onOpenChange={changeOpen}>
      {/* Header and add form keep their height; the list scrolls once it passes a few rows
          (or the space left on a short screen), so the dialog stays compact. */}
      <DialogContent className="flex flex-col gap-3 overflow-hidden sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            Locations
            <Badge variant="secondary" className="font-normal tabular-nums">
              {locations.length}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {descriptionLead} <span className="font-mono">{owner?.code}</span> {owner?.name}.
          </DialogDescription>
        </DialogHeader>

        {locations.length === 0 ? (
          <p className="shrink-0 rounded-md border border-dashed px-3 py-2.5 text-sm text-muted-foreground">
            No locations yet. Add a bin or aisle code below.
          </p>
        ) : (
          <ul
            aria-label="Locations"
            className="max-h-56 min-h-0 shrink divide-y overflow-y-auto overscroll-contain rounded-md border"
          >
            {locations.map((loc) => (
              <li key={loc.id} className="flex items-center gap-3 pl-3 pr-1 text-sm">
                <Badge variant="outline" className="shrink-0 font-mono text-xs font-medium">
                  {loc.code}
                </Badge>
                <span className="min-w-0 flex-1 truncate">{loc.name}</span>
                {onSetDefault ? (
                  <Label className="flex min-h-11 shrink-0 cursor-pointer items-center gap-2 text-xs font-normal">
                    <Checkbox
                      checked={loc.isDefault === true}
                      disabled={pending}
                      onCheckedChange={(value) =>
                        owner && onSetDefault(owner.id, loc, value === true)
                      }
                    />
                    Set as default
                  </Label>
                ) : null}
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={pending}
                  className="size-11 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label={`Remove location ${loc.code}`}
                  onClick={() => owner && onRemove(owner.id, loc)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={submit} className="grid shrink-0 gap-2 border-t pt-3">
          <p className="text-sm font-medium">Add location</p>
          <div className="grid grid-cols-[6rem_1fr] gap-2 sm:grid-cols-[7rem_1fr_auto] sm:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor="loc-code">Code</Label>
              <Input
                id="loc-code"
                placeholder="e.g. A1"
                value={locCode}
                onChange={(event) => setLocCode(event.target.value)}
                disabled={pending}
                aria-invalid={duplicate}
                aria-describedby={duplicate ? "loc-code-error" : undefined}
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
            <Button type="submit" disabled={!canAdd} className="col-span-2 sm:col-span-1">
              <Plus className="size-4" />
              Add
            </Button>
          </div>
          {duplicate ? (
            <p id="loc-code-error" className="text-sm text-destructive" role="alert">
              {duplicateLocationCodeMessage(locCode, ownerNoun)}
            </p>
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}
