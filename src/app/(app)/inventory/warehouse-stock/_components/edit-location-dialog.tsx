"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  editWarehouseStockLocationAction,
  listWarehouseFilterOptionsAction,
  type WarehouseInventoryListItem,
} from "@/features/warehouse-inventory/actions/warehouse-inventory.actions";
import type { WarehouseLocationFilterOption } from "@/features/warehouse-inventory/services/warehouse-inventory.service";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";

/** Move one located serial to another location inside the same warehouse. */
export function EditLocationDialog({
  row,
  onClose,
}: {
  row: WarehouseInventoryListItem | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={row !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        {row ? <EditLocationBody key={row.id} row={row} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function EditLocationBody({ row, onClose }: { row: WarehouseInventoryListItem; onClose: () => void }) {
  const router = useRouter();
  const [locations, setLocations] = useState<WarehouseLocationFilterOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [locationId, setLocationId] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    listWarehouseFilterOptionsAction({ warehouseId: row.warehouse.id })
      .then((result) => {
        if (!cancelled) {
          setLocations(result.locations.filter((loc) => loc.warehouseId === row.warehouse.id));
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError("Could not load this warehouse's locations.");
      });
    return () => {
      cancelled = true;
    };
  }, [row.warehouse.id]);

  const options = (locations ?? [])
    .filter((loc) => loc.id !== row.location.id)
    .map((loc) => ({ id: loc.id, label: loc.code, description: loc.name }));

  function submit() {
    startTransition(async () => {
      const result = await editWarehouseStockLocationAction({
        source: row.source,
        id: row.id,
        locationId,
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.moved
          ? `${result.serialNo} moved from ${result.from} to ${result.to}.`
          : `${result.serialNo} is already in ${result.to}.`,
      );
      onClose();
      router.refresh();
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit location</DialogTitle>
        <DialogDescription>
          <span className="font-mono text-foreground">{row.serialNumber.serialNo}</span> is in{" "}
          <span className="font-mono text-foreground">
            {row.warehouse.code} / {row.location.code}
          </span>
          . Pick another location in the same warehouse.
        </DialogDescription>
      </DialogHeader>

      {loadError ? (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      ) : (
        <SearchableSelect
          id={`edit-location-${row.id}`}
          label="New location"
          options={options}
          value={locationId}
          onChange={setLocationId}
          placeholder={locations ? "Select location…" : "Loading locations…"}
          searchPlaceholder="Search locations…"
          emptyMessage="This warehouse has no other locations. Add one in Settings, Warehouses."
          disabled={pending || !locations}
          popoverClassName="z-70"
        />
      )}

      <DialogFooter>
        <Button variant="outline" className="max-sm:h-11" disabled={pending} onClick={onClose}>
          Cancel
        </Button>
        <Button className="max-sm:h-11" disabled={pending || !locationId} onClick={submit}>
          {pending ? "Saving…" : "Save location"}
        </Button>
      </DialogFooter>
    </>
  );
}
