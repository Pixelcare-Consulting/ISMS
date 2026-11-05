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

  function toggleModel(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
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
  }

  function handleOpenChange(next: boolean) {
    if (pending) return;
    if (!next) onClose();
  }

  function submit() {
    if (selectedModels.length === 0) return;

    const modelIds = selectedModels.map((m) => m.id);

    startTransition(async () => {
      const result = await addPlanogramModelsAction({
        branchId,
        modelIds,
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
          `${result.errors.length} of ${modelIds.length} model${modelIds.length === 1 ? "" : "s"} failed to add`,
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
                  <p className="text-xs text-muted-foreground">
                    A new SKU cannot be ordered until a forecast upload includes this branch.
                  </p>
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
              disabled={pending || loading || selectedModels.length === 0}
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
