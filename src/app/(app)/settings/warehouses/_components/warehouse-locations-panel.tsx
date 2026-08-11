"use client";

import { MapPin, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface LocationRow {
  id: string;
  code: string;
  name: string;
}

interface WarehouseLocationsPanelProps {
  warehouseId: string;
  warehouseName: string;
  locations: LocationRow[];
  locCode: string;
  locName: string;
  pending: boolean;
  onLocCodeChange: (value: string) => void;
  onLocNameChange: (value: string) => void;
  onAdd: (warehouseId: string) => void;
  onRemove: (warehouseId: string, location: LocationRow) => void;
}

export function WarehouseLocationsPanel({
  warehouseId,
  warehouseName,
  locations,
  locCode,
  locName,
  pending,
  onLocCodeChange,
  onLocNameChange,
  onAdd,
  onRemove,
}: WarehouseLocationsPanelProps) {
  const count = locations.length;
  const canAdd = Boolean(locCode.trim() && locName.trim()) && !pending;

  return (
    <div className="rounded-lg border border-border/80 border-l-[3px] border-l-primary/70 bg-muted/40 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <MapPin className="size-3.5" aria-hidden />
          </span>
          <h4 className="text-sm font-semibold text-foreground">Locations</h4>
        </div>
        <Badge variant="secondary" className="font-normal tabular-nums">
          {count}
        </Badge>
        <span className="text-xs text-muted-foreground">
          inside {warehouseName}
        </span>
      </div>

      {count === 0 ? (
        <p className="mb-3 rounded-md border border-dashed border-border/70 bg-background/60 px-3 py-2.5 text-sm text-muted-foreground">
          No locations yet. Add a bin or aisle code so stock can be tracked inside
          this warehouse.
        </p>
      ) : (
        <ul className="mb-3 divide-y divide-border/60 overflow-hidden rounded-md border border-border/70 bg-background/80">
          {locations.map((loc) => (
            <li
              key={loc.id}
              className="flex items-center gap-3 px-3 py-2.5 text-sm"
            >
              <Badge
                variant="outline"
                className="shrink-0 font-mono text-xs font-medium"
              >
                {loc.code}
              </Badge>
              <span className="min-w-0 flex-1 truncate text-foreground">
                {loc.name}
              </span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                disabled={pending}
                className="size-8 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label={`Remove location ${loc.code}`}
                onClick={() => onRemove(warehouseId, loc)}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-md border border-border/70 bg-background/70 p-3">
        <p className="mb-2.5 text-xs font-medium text-muted-foreground">
          Add location
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="grid gap-1.5 sm:w-28">
            <Label htmlFor={`loc-code-${warehouseId}`} className="text-xs">
              Loc code
            </Label>
            <Input
              id={`loc-code-${warehouseId}`}
              placeholder="e.g. A1"
              value={locCode}
              onChange={(e) => onLocCodeChange(e.target.value)}
              className="h-8"
              disabled={pending}
            />
          </div>
          <div className="grid min-w-0 flex-1 gap-1.5 sm:max-w-xs">
            <Label htmlFor={`loc-name-${warehouseId}`} className="text-xs">
              Loc name
            </Label>
            <Input
              id={`loc-name-${warehouseId}`}
              placeholder="e.g. Aisle 1"
              value={locName}
              onChange={(e) => onLocNameChange(e.target.value)}
              className="h-8"
              disabled={pending}
            />
          </div>
          <Button
            type="button"
            size="sm"
            className="h-8 shrink-0"
            disabled={!canAdd}
            onClick={() => onAdd(warehouseId)}
          >
            <Plus className="size-3.5" />
            Add location
          </Button>
        </div>
      </div>
    </div>
  );
}
