"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  addPlanogramModelAction,
  listActiveModelsForPlanogramAction,
  removePlanogramModelAction,
} from "@/features/planogram/actions/planogram.actions";
import type { PlanogramAddEmptyReason } from "@/features/planogram/services/planogram.service";
import {
  AppDataTable,
  AppDataTableBody,
  DeleteConfirmDialog,
  TableEmptyRow,
  TableIndexCell,
  TableIndexHead,
  TableRowActions,
  TableSearchBar,
  uniqueSearchSuggestions,
} from "@/components/data-table";
import { GlobalTableHead, useClientTableSort } from "@/lib/data-table";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { matchesTableSearch } from "@/utils/match-table-search";
import { cn } from "@/utils/cn";

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

function formatPeso(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value);
}

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
    srp: (row) => row.model.srp,
    brand: (row) => row.model.brand?.name ?? null,
    effective: (row) => row.effectiveFrom ?? null,
    stock: (row) => row.stockCount,
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

  const colCount = canManage ? 9 : 8;

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

      <AppDataTable
        title="Planogram"
        shellHeader={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <TableSearchBar
              value={query}
              onChange={setQuery}
              placeholder="Search by SKU, model, series…"
              suggestions={suggestions}
              className="sm:max-w-sm"
            />
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {canManage ? (
                <Button size="sm" onClick={() => setShowAdd(true)}>
                  Add model
                </Button>
              ) : null}
            </div>
          </div>
        }
      >
        <AppDataTableBody>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableIndexHead />
                <GlobalTableHead {...sort.sortProps("sku")}>SKU</GlobalTableHead>
                <GlobalTableHead {...sort.sortProps("model")}>Model</GlobalTableHead>
                <GlobalTableHead {...sort.sortProps("series")}>Series</GlobalTableHead>
                <GlobalTableHead {...sort.sortProps("srp")}>SRP</GlobalTableHead>
                <GlobalTableHead {...sort.sortProps("brand")}>Brand</GlobalTableHead>
                <GlobalTableHead {...sort.sortProps("effective")}>Effective</GlobalTableHead>
                <GlobalTableHead {...sort.sortProps("stock")}>Stock</GlobalTableHead>
                <TableHead className="w-28">Units</TableHead>
                {canManage ? <TableHead className="w-24" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sort.sorted.length === 0 ? (
                <TableEmptyRow
                  colSpan={colCount}
                  message={
                    rows.length === 0
                      ? "No models on this planogram yet."
                      : "No planogram rows match your search."
                  }
                />
              ) : (
                sort.sorted.map((row, index) => (
                  <PlanogramRowEditor
                    key={row.id}
                    index={index}
                    branchId={branchId}
                    row={row}
                    canManage={canManage}
                    pending={pending}
                    onRemove={() => setDeleting(row)}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </AppDataTableBody>
      </AppDataTable>
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

function PlanogramRowEditor({
  index,
  branchId,
  row,
  canManage,
  pending,
  onRemove,
}: {
  index: number;
  branchId: string;
  row: PlanogramRow;
  canManage: boolean;
  pending: boolean;
  onRemove: () => void;
}) {
  const inventoryHref = `/inventory?branch=${branchId}&sku=${encodeURIComponent(row.model.skuCode)}`;

  return (
    <TableRow className={cn(index % 2 === 1 && "bg-table-stripe")}>
      <TableIndexCell index={index + 1} />
      <TableCell className="font-mono text-sm">{row.model.skuCode}</TableCell>
      <TableCell>{row.model.name}</TableCell>
      <TableCell>{row.model.series ?? "—"}</TableCell>
      <TableCell className="tabular-nums">{formatPeso(row.model.srp)}</TableCell>
      <TableCell>{row.model.brand?.name ?? "—"}</TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {row.effectiveFrom ?? "—"}
      </TableCell>
      <TableCell>
        STK {row.stockCount} · DIT {row.ditCount}
      </TableCell>
      <TableCell>
        <Button variant="link" size="sm" className="h-auto p-0" asChild>
          <Link href={inventoryHref}>View units</Link>
        </Button>
      </TableCell>
      {canManage ? (
        <TableRowActions
          onDelete={onRemove}
          deleteDisabled={pending}
          deleteTitle="Remove from planogram"
        />
      ) : null}
    </TableRow>
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
  const [modelId, setModelId] = useState("");
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
        setModelId(result.models[0]?.id ?? "");
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

  function submit() {
    startTransition(async () => {
      const result = await addPlanogramModelAction({
        branchId,
        modelId,
        maxQty: 1,
        daysThreshold: 30,
      });
      if ("emptyReason" in result && result.emptyReason) {
        setEmptyReason(result.emptyReason);
        return;
      }
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Model added to planogram");
      onAdded();
    });
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6 shadow-lg">
          <h3 className="font-medium">Add model to planogram</h3>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading active SKUs…</p>
          ) : models.length > 0 ? (
            <>
              <SearchableSelect
                label="Model"
                options={models.map((m) => ({
                  id: m.id,
                  label: `${m.skuCode} — ${m.name}`,
                }))}
                value={modelId}
                onChange={setModelId}
                placeholder="Select model…"
                searchPlaceholder="Search models…"
              />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No active SKUs available to add.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={pending || loading || !modelId} onClick={submit}>
              Add
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog
        open={emptyReason !== null}
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
