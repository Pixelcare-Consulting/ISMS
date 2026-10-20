"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { toast } from "sonner";

import {
  addPlanogramModelsAction,
  listActiveModelsForPlanogramAction,
  removePlanogramModelAction,
  updatePlanogramMaxQtyAction,
} from "@/features/planogram/actions/planogram.actions";
import type { PlanogramAddEmptyReason } from "@/features/planogram/services/planogram.service";
import {
  DeleteConfirmDialog,
  TableRowActions,
  uniqueSearchSuggestions,
} from "@/components/data-table";
import {
  DataTable,
  useClientTableSort,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { matchesTableSearch } from "@/utils/match-table-search";

interface PlanogramRow {
  id: string;
  maxQty: number;
  effectiveFrom?: string | null;
  stockCount: number;
  ditCount: number;
  daysThreshold: number | null;
  model: {
    id: string;
    skuCode: string;
    name: string;
    status: string;
    srp: number | null;
    series: string | null;
    brand: { name: string } | null;
  };
}

const planogramColumn = createColumnHelper<DataTableFeatures, PlanogramRow>();

function messageForAddEmptyReason(reason: PlanogramAddEmptyReason): string {
  switch (reason) {
    case "no_allowed_models":
      return "This branch has no allowed models. Add active SKUs on Allowed models first.";
    case "no_active_skus":
      return "There are no active SKUs in Models.";
    case "all_already_on_planogram":
      return "All allowed active SKUs are already on this planogram.";
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

export function PlanogramTable({
  branchId,
  rows,
  canManage,
  offPlanogramSerialCount = 0,
  onOpenAllowedModels,
}: {
  branchId: string;
  rows: PlanogramRow[];
  canManage: boolean;
  offPlanogramSerialCount?: number;
  onOpenAllowedModels?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [query, setQuery] = useState("");
  const [deleting, setDeleting] = useState<PlanogramRow | null>(null);

  const filtered = useMemo(
    () =>
      rows.filter((row) =>
        matchesTableSearch(query, [
          row.model.skuCode,
          row.model.name,
          row.model.series,
          row.model.brand?.name,
        ]),
      ),
    [rows, query],
  );

  const sort = useClientTableSort(filtered, {
    sku: (row) => row.model.skuCode,
    model: (row) => row.model.name,
    series: (row) => row.model.series,
    maxQty: (row) => row.maxQty,
  });

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        rows.map((row) => row.model.skuCode),
        rows.map((row) => row.model.name),
        rows.map((row) => row.model.series),
        rows.map((row) => row.model.brand?.name),
      ),
    [rows],
  );

  const columns = useMemo(() => {
    const cols: DataTableColumn<PlanogramRow>[] = [
      planogramColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => row.index + 1,
        meta: { className: "tabular-nums text-muted-foreground" },
      }),
      planogramColumn.display({
        id: "sku",
        header: "SKU",
        enableSorting: true,
        cell: ({ row }) => row.original.model.skuCode,
        meta: { className: "font-mono text-sm" },
      }),
      planogramColumn.display({
        id: "model",
        header: "Model",
        enableSorting: true,
        cell: ({ row }) => row.original.model.name,
      }),
      planogramColumn.display({
        id: "series",
        header: "Series",
        enableSorting: true,
        cell: ({ row }) => row.original.model.series ?? "—",
      }),
      planogramColumn.display({
        id: "maxQty",
        header: "Shelf max",
        enableSorting: true,
        cell: ({ row }) => (
          <ShelfMaxCell
            key={`${row.original.id}:${row.original.maxQty}`}
            branchId={branchId}
            planogramId={row.original.id}
            maxQty={row.original.maxQty}
            canManage={canManage}
          />
        ),
      }),
      planogramColumn.display({
        id: "units",
        header: "Units",
        enableSorting: false,
        cell: ({ row }) => (
          <Button variant="link" size="sm" className="h-auto p-0" asChild>
            <Link
              href={`/inventory?branch=${branchId}&sku=${encodeURIComponent(row.original.model.skuCode)}`}
            >
              View units
            </Link>
          </Button>
        ),
      }),
    ];
    if (canManage) {
      cols.push(
        planogramColumn.display({
          id: "actions",
          header: "",
          enableSorting: false,
          cell: ({ row }) => (
            <TableRowActions
              asCell={false}
              onDelete={() => setDeleting(row.original)}
              deleteDisabled={pending}
              deleteTitle="Remove from planogram"
            />
          ),
          meta: { align: "end" },
        }),
      );
    }
    return cols;
  }, [branchId, canManage, pending]);

  function handleRemove() {
    if (!deleting) return;
    const planogramId = deleting.id;

    startTransition(async () => {
      const result = await removePlanogramModelAction(planogramId, branchId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Model removed from planogram");
      setDeleting(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {offPlanogramSerialCount > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          {offPlanogramSerialCount} inventory unit
          {offPlanogramSerialCount === 1 ? "" : "s"} at this branch{" "}
          {offPlanogramSerialCount === 1 ? "is" : "are"} off-planogram.{" "}
          <Link href={`/inventory?branch=${branchId}&offPlanogram=1`} className="underline">
            View units
          </Link>
        </div>
      ) : null}

      <DataTable
        data={sort.sorted}
        columns={columns}
        getRowId={(row) => row.id}
        manualSorting
        enableSorting
        sorting={{
          sortKey: sort.sortKey,
          sortDir: sort.sortDir,
          onSort: sort.toggleSort,
        }}
        stickyHeader
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search by SKU, model, series…",
          suggestions,
        }}
        toolbarActions={
          canManage ? (
            <Button size="sm" onClick={() => setShowAdd(true)}>
              Add model
            </Button>
          ) : null
        }
        empty={sort.sorted.length === 0}
        emptyMessage={
          rows.length === 0
            ? "No models on this planogram yet."
            : "No planogram rows match your search."
        }
      />
      {showAdd ? (
        <AddPlanogramDialog
          branchId={branchId}
          onClose={() => setShowAdd(false)}
          onOpenAllowedModels={() => {
            setShowAdd(false);
            onOpenAllowedModels?.();
          }}
          onAdded={() => {
            setShowAdd(false);
            router.refresh();
          }}
        />
      ) : null}

      <DeleteConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Remove model from planogram?"
        description={
          deleting
            ? `Remove ${deleting.model.skuCode} (${deleting.model.name}) from this planogram?`
            : "Remove this model from the planogram?"
        }
        confirmLabel="Remove"
        onConfirm={handleRemove}
        pending={pending}
      />
    </div>
  );
}

function ShelfMaxCell({
  branchId,
  planogramId,
  maxQty,
  canManage,
}: {
  branchId: string;
  planogramId: string;
  maxQty: number;
  canManage: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(String(maxQty));
  const [pending, startTransition] = useTransition();

  function save() {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed < 1) {
      setValue(String(maxQty));
      toast.error("Shelf max must be at least 1");
      return;
    }
    if (parsed === maxQty) return;

    startTransition(async () => {
      const result = await updatePlanogramMaxQtyAction({
        planogramId,
        branchId,
        maxQty: parsed,
      });
      if (result.error) {
        toast.error(result.error);
        setValue(String(maxQty));
        return;
      }
      toast.success("Shelf max updated");
      router.refresh();
    });
  }

  if (!canManage) {
    return <span className="tabular-nums">{maxQty}</span>;
  }

  return (
    <Input
      type="number"
      min={1}
      step={1}
      className="h-8 w-16 tabular-nums"
      value={value}
      disabled={pending}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
      aria-label="Shelf max"
    />
  );
}

function AddPlanogramDialog({
  branchId,
  onClose,
  onAdded,
  onOpenAllowedModels,
}: {
  branchId: string;
  onClose: () => void;
  onAdded: () => void;
  onOpenAllowedModels?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);
  const [models, setModels] = useState<
    { id: string; skuCode: string; name: string }[]
  >([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [maxQtyByModel, setMaxQtyByModel] = useState<Record<string, string>>({});
  const [candidateQuery, setCandidateQuery] = useState("");
  const [emptyReason, setEmptyReason] = useState<PlanogramAddEmptyReason | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    async function loadModels() {
      setLoading(true);
      try {
        const result = await listActiveModelsForPlanogramAction(branchId);
        if (cancelled) return;
        setModels(result.models.map((m) => ({ id: m.id, skuCode: m.skuCode, name: m.name })));
        setSelectedIds(new Set());
        setMaxQtyByModel({});
        setEmptyReason(result.emptyReason);
      } catch (error) {
        if (cancelled) return;
        toast.error(error instanceof Error ? error.message : "Failed to load active SKUs");
        setEmptyReason(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadModels();
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  const filteredModels = useMemo(
    () => models.filter((m) => matchesTableSearch(candidateQuery, [m.skuCode, m.name])),
    [models, candidateQuery],
  );

  const selectedModels = useMemo(
    () => models.filter((m) => selectedIds.has(m.id)),
    [models, selectedIds],
  );

  const allFilteredSelected =
    filteredModels.length > 0 && filteredModels.every((m) => selectedIds.has(m.id));

  const shelfMaxValid =
    selectedModels.length > 0 &&
    selectedModels.every((m) => {
      const parsed = Number.parseInt(maxQtyByModel[m.id] ?? "1", 10);
      return Number.isInteger(parsed) && parsed >= 1;
    });

  function toggleModel(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
    if (checked) {
      setMaxQtyByModel((prev) => (prev[id] != null ? prev : { ...prev, [id]: "1" }));
    }
  }

  function toggleSelectAllFiltered(checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const m of filteredModels) {
        if (checked) next.add(m.id);
        else next.delete(m.id);
      }
      return next;
    });
    if (checked) {
      setMaxQtyByModel((prev) => {
        const next = { ...prev };
        for (const m of filteredModels) {
          if (next[m.id] == null) next[m.id] = "1";
        }
        return next;
      });
    }
  }

  function handleOpenChange(next: boolean) {
    if (pending) return;
    if (!next) onClose();
  }

  function submit() {
    if (!shelfMaxValid) {
      toast.error("Shelf max must be at least 1 for each selected model");
      return;
    }

    const items = selectedModels.map((m) => ({
      modelId: m.id,
      maxQty: Number.parseInt(maxQtyByModel[m.id] ?? "1", 10),
    }));

    startTransition(async () => {
      const result = await addPlanogramModelsAction({
        branchId,
        items,
        daysThreshold: 30,
      });

      if ("error" in result && result.error && !("added" in result)) {
        toast.error(result.error);
        return;
      }

      if (!("added" in result) || typeof result.added !== "number") {
        toast.error("Failed to add models");
        return;
      }

      const added = result.added;
      const notAllowed = result.errors?.find((e) => e.emptyReason);
      if (added === 0 && notAllowed?.emptyReason) {
        setEmptyReason(notAllowed.emptyReason);
        return;
      }

      if (result.errors && result.errors.length > 0) {
        toast.error(
          `${result.errors.length} of ${items.length} model${items.length === 1 ? "" : "s"} failed to add`,
        );
      } else {
        toast.success(
          `${added} model${added === 1 ? "" : "s"} added to planogram`,
        );
      }

      if (added > 0) {
        onAdded();
      }
    });
  }

  const showCannotAdd = emptyReason !== null;
  const showPicker = !showCannotAdd;

  return (
    <>
      <Dialog open={showPicker} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add models to planogram</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading active SKUs…</p>
            ) : models.length > 0 ? (
              <>
                <Input
                  placeholder="Search models…"
                  value={candidateQuery}
                  onChange={(e) => setCandidateQuery(e.target.value)}
                  className="h-8"
                  disabled={pending}
                />
                <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
                  <Checkbox
                    checked={allFilteredSelected}
                    onCheckedChange={(checked) =>
                      toggleSelectAllFiltered(Boolean(checked))
                    }
                    disabled={filteredModels.length === 0 || pending}
                    aria-label="Select all filtered models"
                  />
                  <Label className="text-xs text-muted-foreground">
                    Select all ({filteredModels.length})
                  </Label>
                </div>
                <div className="max-h-48 overflow-y-auto rounded-md border">
                  {filteredModels.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-muted-foreground">
                      No matching models.
                    </p>
                  ) : (
                    filteredModels.map((m) => (
                      <label
                        key={m.id}
                        className="flex cursor-pointer items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0 hover:bg-muted/40"
                      >
                        <Checkbox
                          checked={selectedIds.has(m.id)}
                          onCheckedChange={(checked) =>
                            toggleModel(m.id, Boolean(checked))
                          }
                          disabled={pending}
                          aria-label={`Select ${m.skuCode}`}
                        />
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-mono">{m.skuCode}</span> — {m.name}
                        </span>
                      </label>
                    ))
                  )}
                </div>

                {selectedModels.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Selected models</p>
                    <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
                      {selectedModels.map((m) => (
                        <div
                          key={m.id}
                          className="flex flex-wrap items-center gap-3 text-sm"
                        >
                          <span className="min-w-0 flex-1 truncate">
                            <span className="font-mono">{m.skuCode}</span> — {m.name}
                          </span>
                          <div className="flex items-center gap-2">
                            <Label
                              htmlFor={`shelf-max-${m.id}`}
                              className="shrink-0 text-xs text-muted-foreground"
                            >
                              Shelf max
                            </Label>
                            <Input
                              id={`shelf-max-${m.id}`}
                              type="number"
                              min={1}
                              step={1}
                              className="h-8 w-20 tabular-nums"
                              value={maxQtyByModel[m.id] ?? "1"}
                              onChange={(e) =>
                                setMaxQtyByModel((prev) => ({
                                  ...prev,
                                  [m.id]: e.target.value,
                                }))
                              }
                              disabled={pending}
                              aria-label={`Shelf max for ${m.skuCode}`}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      How many units this branch should hold for each model. Suggested
                      order qty = Shelf max − on-hand (STK).
                    </p>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No active SKUs available to add.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button
              disabled={pending || loading || !shelfMaxValid}
              onClick={submit}
            >
              {selectedModels.length > 0
                ? `Add ${selectedModels.length} model${selectedModels.length === 1 ? "" : "s"}`
                : "Add models"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={showCannotAdd}
        onOpenChange={(open) => {
          if (!open) {
            setEmptyReason(null);
            onClose();
          }
        }}
      >
        <AlertDialogContent className="z-60" overlayClassName="z-60">
          <AlertDialogHeader>
            <AlertDialogTitle>Cannot add model</AlertDialogTitle>
            <AlertDialogDescription>
              {emptyReason ? messageForAddEmptyReason(emptyReason) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setEmptyReason(null);
                onOpenAllowedModels?.();
              }}
            >
              Open Allowed models
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
