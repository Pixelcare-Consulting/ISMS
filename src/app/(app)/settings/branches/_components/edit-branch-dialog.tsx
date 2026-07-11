"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  listBranchFormOptionsAction,
  updateBranchAction,
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

interface EditBranchDialogProps {
  branch: {
    id: string;
    sapCode: string;
    name: string;
    status: string;
    areaId?: string | null;
    branchAreaId?: string | null;
    dealerId?: string | null;
    primaryWarehouseId?: string | null;
    regionId?: string | null;
    provinceId?: string | null;
    alternateWarehouses?: { warehouseId: string }[];
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: (branch: {
    id: string;
    sapCode: string;
    name: string;
    status: string;
    branchArea: { name: string } | null;
  }) => void;
}

export function EditBranchDialog({
  branch,
  open,
  onOpenChange,
  onUpdated,
}: EditBranchDialogProps) {
  const [pending, startTransition] = useTransition();
  const [options, setOptions] = useState<FormOptions | null>(null);
  const initialPrimary = branch.primaryWarehouseId ?? "";
  const [alternateIds, setAlternateIds] = useState<string[]>(() =>
    (branch.alternateWarehouses?.map((row) => row.warehouseId) ?? []).filter(
      (id) => id !== initialPrimary,
    ),
  );
  const [primaryWarehouseId, setPrimaryWarehouseId] = useState(initialPrimary);

  useEffect(() => {
    if (!open) return;
    void listBranchFormOptionsAction().then(setOptions);
  }, [open, branch.id]);

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

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateBranchAction({
        branchId: branch.id,
        sapCode: String(fd.get("sapCode")),
        name: String(fd.get("name")),
        status: (fd.get("status") as "active" | "inactive") || "active",
        areaId: String(fd.get("areaId") || "") || null,
        branchAreaId: String(fd.get("branchAreaId") || "") || null,
        dealerId: String(fd.get("dealerId") || "") || null,
        primaryWarehouseId: String(fd.get("primaryWarehouseId") || "") || null,
        regionId: String(fd.get("regionId") || "") || null,
        provinceId: String(fd.get("provinceId") || "") || null,
        alternateWarehouseIds: alternateIds,
      });
      if (result.error) {
        toast.error(typeof result.error === "string" ? result.error : "Could not update branch");
        return;
      }
      toast.success("Branch updated");
      if (result.branch) {
        onUpdated?.({
          id: result.branch.id,
          sapCode: result.branch.sapCode,
          name: result.branch.name,
          status: result.branch.status,
          branchArea: result.branch.branchArea ?? null,
        });
      }
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit branch</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="edit-sapCode">SAP code</Label>
            <Input id="edit-sapCode" name="sapCode" defaultValue={branch.sapCode} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-name">Name</Label>
            <Input id="edit-name" name="name" defaultValue={branch.name} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-status">Status</Label>
            <select
              id="edit-status"
              name="status"
              defaultValue={branch.status}
              className={selectClassName}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          {options ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>Dealer</Label>
                  <select
                    name="dealerId"
                    defaultValue={branch.dealerId ?? ""}
                    className={selectClassName}
                  >
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
                  <select
                    name="branchAreaId"
                    defaultValue={branch.branchAreaId ?? ""}
                    className={selectClassName}
                  >
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
                  <select
                    name="areaId"
                    defaultValue={branch.areaId ?? ""}
                    className={selectClassName}
                  >
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
                  <select
                    name="regionId"
                    defaultValue={branch.regionId ?? ""}
                    className={selectClassName}
                  >
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
                  <select
                    name="provinceId"
                    defaultValue={branch.provinceId ?? ""}
                    className={selectClassName}
                  >
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
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
