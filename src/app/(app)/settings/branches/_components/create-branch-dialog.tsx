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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Switch } from "@/components/ui/switch";
import {
  BranchScheduleFields,
  EMPTY_SCHEDULE,
  buildSchedulePayload,
  type BranchScheduleState,
} from "@/app/(app)/settings/branches/_components/branch-schedule-fields";

type FormOptions = Awaited<ReturnType<typeof listBranchFormOptionsAction>>;

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
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [dealerId, setDealerId] = useState("");
  const [alternateFilterDealerId, setAlternateFilterDealerId] = useState("");
  const [branchAreaId, setBranchAreaId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [regionId, setRegionId] = useState("");
  const [provinceId, setProvinceId] = useState("");
  const [schedule, setSchedule] = useState<BranchScheduleState>(EMPTY_SCHEDULE);

  const alternateBranchOptions = useMemo(() => {
    if (!options) return [];
    const selected = new Set(alternateIds);
    return options.branches
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
  }, [options, alternateFilterDealerId, alternateIds]);

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
      // Clearing the filter restores the empty starting selection.
      setAlternateIds([]);
      return;
    }
    if (!options) return;
    // Replace (do not merge) so switching dealers clears the previous auto-select.
    setAlternateIds(
      options.branches
        .filter((b) => b.dealerId === nextDealerId)
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

  async function ensureOptions() {
    if (options) return;
    setOptions(await listBranchFormOptionsAction());
  }

  function resetSelects() {
    setAlternateIds([]);
    setPrimaryWarehouseId("");
    setStatus("active");
    setDealerId("");
    setAlternateFilterDealerId("");
    setBranchAreaId("");
    setAreaId("");
    setRegionId("");
    setProvinceId("");
    setSchedule(EMPTY_SCHEDULE);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createBranchAction({
        sapCode: String(fd.get("sapCode") ?? ""),
        name: String(fd.get("name") ?? ""),
        status,
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
      resetSelects();
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
          if (!next) resetSelects();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add branch</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="grid grid-cols-[minmax(0,9rem)_1fr] gap-2">
              <div className="space-y-2">
                <Label htmlFor="sapCode">SAP code</Label>
                <Input id="sapCode" name="sapCode" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" required />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
              <div className="space-y-0.5">
                <Label htmlFor="create-status">Status</Label>
                <p className="text-xs text-muted-foreground">
                  {status === "active" ? "Active" : "Inactive"}
                </p>
              </div>
              <Switch
                id="create-status"
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
                {pending ? "Saving…" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
