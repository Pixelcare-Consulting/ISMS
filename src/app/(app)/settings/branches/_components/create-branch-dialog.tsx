"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import {
  createBranchAction,
  listBranchFormOptionsAction,
} from "@/features/branches/actions/branch.actions";
import { SearchableMultiSelect } from "@/features/aors/components/searchable-multi-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FormOptions = Awaited<ReturnType<typeof listBranchFormOptionsAction>>;

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm";

interface CreateBranchDialogProps {
  onCreated?: (branch: {
    id: string;
    sapCode: string;
    name: string;
    status: string;
    branchArea: { name: string } | null;
  }) => void;
}

export function CreateBranchDialog({ onCreated }: CreateBranchDialogProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [options, setOptions] = useState<FormOptions | null>(null);
  const [alternateIds, setAlternateIds] = useState<string[]>([]);
  const [primaryWarehouseId, setPrimaryWarehouseId] = useState("");

  const warehouseOptions = useMemo(() => {
    if (!options) return [];
    return options.warehouses
      .filter((w) => w.id !== primaryWarehouseId)
      .map((w) => ({
        id: w.id,
        label: `${w.code} — ${w.name}`,
        description: w.name,
      }));
  }, [options, primaryWarehouseId]);

  async function ensureOptions() {
    if (options) return;
    setOptions(await listBranchFormOptionsAction());
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createBranchAction({
        sapCode: String(fd.get("sapCode") ?? ""),
        name: String(fd.get("name") ?? ""),
        status: "active",
        areaId: String(fd.get("areaId") || "") || null,
        branchAreaId: String(fd.get("branchAreaId") || "") || null,
        dealerId: String(fd.get("dealerId") || "") || null,
        primaryWarehouseId: String(fd.get("primaryWarehouseId") || "") || null,
        regionId: String(fd.get("regionId") || "") || null,
        provinceId: String(fd.get("provinceId") || "") || null,
        alternateWarehouseIds: alternateIds,
      });
      if (result.error) {
        toast.error(typeof result.error === "string" ? result.error : "Could not create branch");
        return;
      }
      toast.success("Branch created");
      if (result.branch) {
        onCreated?.({
          id: result.branch.id,
          sapCode: result.branch.sapCode,
          name: result.branch.name,
          status: result.branch.status,
          branchArea: result.branch.branchArea ?? null,
        });
      }
      setAlternateIds([]);
      setPrimaryWarehouseId("");
      setOpen(false);
    });
  }

  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
          void ensureOptions();
        }}
      >
        <Plus className="size-4" />
        Add branch
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setAlternateIds([]);
            setPrimaryWarehouseId("");
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add branch</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="sapCode">SAP code</Label>
              <Input id="sapCode" name="sapCode" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required />
            </div>
            {options ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>Dealer</Label>
                    <select name="dealerId" className={selectClassName}>
                      <option value="">—</option>
                      {options.dealers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>Primary warehouse</Label>
                    <select
                      name="primaryWarehouseId"
                      className={selectClassName}
                      value={primaryWarehouseId}
                      onChange={(e) => {
                        const next = e.target.value;
                        setPrimaryWarehouseId(next);
                        if (next) {
                          setAlternateIds((current) =>
                            current.filter((id) => id !== next),
                          );
                        }
                      }}
                    >
                      <option value="">—</option>
                      {options.warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.code} — {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>Branch area</Label>
                    <select name="branchAreaId" className={selectClassName}>
                      <option value="">—</option>
                      {options.branchAreas.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>Area</Label>
                    <select name="areaId" className={selectClassName}>
                      <option value="">—</option>
                      {options.areas.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} — {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>Region</Label>
                    <select name="regionId" className={selectClassName}>
                      <option value="">—</option>
                      {options.regions.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>Province</Label>
                    <select name="provinceId" className={selectClassName}>
                      <option value="">—</option>
                      {options.provinces.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <SearchableMultiSelect
                  label="Alternate warehouses"
                  options={warehouseOptions}
                  selectedIds={alternateIds}
                  onChange={setAlternateIds}
                  placeholder="Search and select warehouses…"
                  searchPlaceholder="Filter by code or name…"
                  emptyMessage="No warehouses available."
                  hint="Primary warehouse is excluded from alternates."
                  disabled={pending}
                />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Loading options…</p>
            )}
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
