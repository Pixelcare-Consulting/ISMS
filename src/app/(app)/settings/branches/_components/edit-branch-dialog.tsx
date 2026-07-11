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
import { SearchableSelect } from "@/components/ui/searchable-select";

type FormOptions = Awaited<ReturnType<typeof listBranchFormOptionsAction>>;

const STATUS_OPTIONS = [
  { id: "active", label: "Active" },
  { id: "inactive", label: "Inactive" },
];

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
  const [status, setStatus] = useState(branch.status || "active");
  const [dealerId, setDealerId] = useState(branch.dealerId ?? "");
  const [branchAreaId, setBranchAreaId] = useState(branch.branchAreaId ?? "");
  const [areaId, setAreaId] = useState(branch.areaId ?? "");
  const [regionId, setRegionId] = useState(branch.regionId ?? "");
  const [provinceId, setProvinceId] = useState(branch.provinceId ?? "");

  useEffect(() => {
    if (!open) return;
    void listBranchFormOptionsAction().then(setOptions);
    const nextPrimary = branch.primaryWarehouseId ?? "";
    setPrimaryWarehouseId(nextPrimary);
    setAlternateIds(
      (branch.alternateWarehouses?.map((row) => row.warehouseId) ?? []).filter(
        (id) => id !== nextPrimary,
      ),
    );
    setStatus(branch.status || "active");
    setDealerId(branch.dealerId ?? "");
    setBranchAreaId(branch.branchAreaId ?? "");
    setAreaId(branch.areaId ?? "");
    setRegionId(branch.regionId ?? "");
    setProvinceId(branch.provinceId ?? "");
  }, [open, branch]);

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

  const dealerOptions = useMemo(
    () =>
      (options?.dealers ?? []).map((d) => ({
        id: d.id,
        label: d.name,
      })),
    [options],
  );

  const primaryWarehouseOptions = useMemo(
    () =>
      (options?.warehouses ?? []).map((w) => ({
        id: w.id,
        label: `${w.code} — ${w.name}`,
        description: w.name,
      })),
    [options],
  );

  const branchAreaOptions = useMemo(
    () =>
      (options?.branchAreas ?? []).map((a) => ({
        id: a.id,
        label: a.name,
      })),
    [options],
  );

  const areaOptions = useMemo(
    () =>
      (options?.areas ?? []).map((a) => ({
        id: a.id,
        label: `${a.code} — ${a.name}`,
      })),
    [options],
  );

  const regionOptions = useMemo(
    () =>
      (options?.regions ?? []).map((a) => ({
        id: a.id,
        label: a.name,
      })),
    [options],
  );

  const provinceOptions = useMemo(
    () =>
      (options?.provinces ?? []).map((a) => ({
        id: a.id,
        label: a.name,
      })),
    [options],
  );

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateBranchAction({
        branchId: branch.id,
        sapCode: String(fd.get("sapCode")),
        name: String(fd.get("name")),
        status: (status as "active" | "inactive") || "active",
        areaId: areaId || null,
        branchAreaId: branchAreaId || null,
        dealerId: dealerId || null,
        primaryWarehouseId: primaryWarehouseId || null,
        regionId: regionId || null,
        provinceId: provinceId || null,
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
          <SearchableSelect
            label="Status"
            id="edit-status"
            options={STATUS_OPTIONS}
            value={status}
            onChange={setStatus}
            searchPlaceholder="Search status…"
            disabled={pending}
          />
          {options ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <SearchableSelect
                  label="Dealer"
                  options={dealerOptions}
                  value={dealerId}
                  onChange={setDealerId}
                  allowClear
                  placeholder="—"
                  searchPlaceholder="Search dealers…"
                  disabled={pending}
                />
                <SearchableSelect
                  label="Primary warehouse"
                  options={primaryWarehouseOptions}
                  value={primaryWarehouseId}
                  onChange={(next) => {
                    setPrimaryWarehouseId(next);
                    if (next) {
                      setAlternateIds((current) =>
                        current.filter((id) => id !== next),
                      );
                    }
                  }}
                  allowClear
                  placeholder="—"
                  searchPlaceholder="Search warehouses…"
                  disabled={pending}
                />
                <SearchableSelect
                  label="Branch area"
                  options={branchAreaOptions}
                  value={branchAreaId}
                  onChange={setBranchAreaId}
                  allowClear
                  placeholder="—"
                  searchPlaceholder="Search branch areas…"
                  disabled={pending}
                />
                <SearchableSelect
                  label="Area"
                  options={areaOptions}
                  value={areaId}
                  onChange={setAreaId}
                  allowClear
                  placeholder="—"
                  searchPlaceholder="Search areas…"
                  disabled={pending}
                />
                <SearchableSelect
                  label="Region"
                  options={regionOptions}
                  value={regionId}
                  onChange={setRegionId}
                  allowClear
                  placeholder="—"
                  searchPlaceholder="Search regions…"
                  disabled={pending}
                />
                <SearchableSelect
                  label="Province"
                  options={provinceOptions}
                  value={provinceId}
                  onChange={setProvinceId}
                  allowClear
                  placeholder="—"
                  searchPlaceholder="Search provinces…"
                  disabled={pending}
                />
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
