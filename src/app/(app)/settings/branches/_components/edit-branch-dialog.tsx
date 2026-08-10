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
import { Switch } from "@/components/ui/switch";
import {
  BranchScheduleFields,
  EMPTY_SCHEDULE,
  buildSchedulePayload,
  type BranchScheduleState,
} from "@/app/(app)/settings/branches/_components/branch-schedule-fields";

type FormOptions = Awaited<ReturnType<typeof listBranchFormOptionsAction>>;

interface BranchScheduleConfig {
  frequencyCodeId: string;
  deliveryDays: number[];
  orderDays: number[];
  notes: string | null;
}

function scheduleStateFrom(config?: BranchScheduleConfig | null): BranchScheduleState {
  if (!config) return EMPTY_SCHEDULE;
  return {
    enabled: true,
    frequencyCodeId: config.frequencyCodeId,
    deliveryDays: config.deliveryDays ?? [],
    orderDays: config.orderDays ?? [],
    notes: config.notes ?? "",
  };
}

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
    alternateWarehouses?: { alternateBranchId: string }[];
    deliveryScheduleConfig?: BranchScheduleConfig | null;
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit branch</DialogTitle>
        </DialogHeader>
        {open ? (
          <EditBranchForm
            key={branch.id}
            branch={branch}
            onOpenChange={onOpenChange}
            onUpdated={onUpdated}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function EditBranchForm({
  branch,
  onOpenChange,
  onUpdated,
}: Omit<EditBranchDialogProps, "open">) {
  const [pending, startTransition] = useTransition();
  const [options, setOptions] = useState<FormOptions | null>(null);
  const [alternateIds, setAlternateIds] = useState<string[]>(
    () => branch.alternateWarehouses?.map((row) => row.alternateBranchId) ?? [],
  );
  const [primaryWarehouseId, setPrimaryWarehouseId] = useState(
    branch.primaryWarehouseId ?? "",
  );
  const [status, setStatus] = useState(branch.status || "active");
  const [dealerId, setDealerId] = useState(branch.dealerId ?? "");
  const [alternateFilterDealerId, setAlternateFilterDealerId] = useState("");
  const [branchAreaId, setBranchAreaId] = useState(branch.branchAreaId ?? "");
  const [areaId, setAreaId] = useState(branch.areaId ?? "");
  const [regionId, setRegionId] = useState(branch.regionId ?? "");
  const [provinceId, setProvinceId] = useState(branch.provinceId ?? "");
  const [schedule, setSchedule] = useState<BranchScheduleState>(() =>
    scheduleStateFrom(branch.deliveryScheduleConfig),
  );

  useEffect(() => {
    let cancelled = false;
    void listBranchFormOptionsAction().then((next) => {
      if (!cancelled) setOptions(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const alternateBranchOptions = useMemo(() => {
    if (!options) return [];
    const selected = new Set(alternateIds);
    return options.branches
      .filter((b) => b.id !== branch.id)
      .filter(
        (b) =>
          !alternateFilterDealerId ||
          b.dealerId === alternateFilterDealerId ||
          selected.has(b.id),
      )
      .map((b) => ({
        id: b.id,
        label: `${b.sapCode} — ${b.name}`,
        description: b.name,
      }));
  }, [options, branch.id, alternateFilterDealerId, alternateIds]);

  const dealerOptions = useMemo(
    () =>
      (options?.dealers ?? []).map((d) => ({
        id: d.id,
        label: d.name,
      })),
    [options],
  );

  function onAlternateFilterDealerChange(nextDealerId: string) {
    setAlternateFilterDealerId(nextDealerId);
    if (!nextDealerId) {
      // Clearing the filter restores the branch’s original alternate picks.
      setAlternateIds(
        branch.alternateWarehouses?.map((row) => row.alternateBranchId) ?? [],
      );
      return;
    }
    if (!options) return;
    // Replace (do not merge) so switching dealers clears the previous auto-select.
    setAlternateIds(
      options.branches
        .filter((b) => b.id !== branch.id && b.dealerId === nextDealerId)
        .map((b) => b.id),
    );
  }

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
        alternateBranchIds: alternateIds,
        schedule: buildSchedulePayload(schedule),
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
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-[minmax(0,9rem)_1fr] gap-2">
        <div className="space-y-2">
          <Label htmlFor="edit-sapCode">SAP code</Label>
          <Input id="edit-sapCode" name="sapCode" defaultValue={branch.sapCode} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-name">Name</Label>
          <Input id="edit-name" name="name" defaultValue={branch.name} required />
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
        <div className="space-y-0.5">
          <Label htmlFor="edit-status">Status</Label>
          <p className="text-xs text-muted-foreground">
            {status === "active" ? "Active" : "Inactive"}
          </p>
        </div>
        <Switch
          id="edit-status"
          checked={status === "active"}
          onCheckedChange={(checked) => setStatus(checked ? "active" : "inactive")}
          disabled={pending}
          aria-label="Branch status"
        />
      </div>
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
              onChange={setPrimaryWarehouseId}
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
          <SearchableSelect
            label="Filter by dealer"
            options={dealerOptions}
            value={alternateFilterDealerId}
            onChange={onAlternateFilterDealerChange}
            allowClear
            placeholder="—"
            searchPlaceholder="Search dealers…"
            disabled={pending}
          />
          <SearchableMultiSelect
            label="Alternate branches"
            options={alternateBranchOptions}
            selectedIds={alternateIds}
            onChange={setAlternateIds}
            placeholder="Search and select branches…"
            searchPlaceholder="Filter by code or name…"
            emptyMessage="No branches available."
            hint="Uses Filter by dealer to list that dealer’s branches and select them (same idea as AOR)."
            disabled={pending}
          />
          <BranchScheduleFields
            value={schedule}
            onChange={setSchedule}
            frequencyCodes={options.frequencyCodes}
            globalLockedWeekdays={options.globalLockedWeekdays}
            canManageOrderingPolicy={options.canManageOrderingPolicy}
            disabled={pending}
          />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Loading options…</p>
      )}
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}
