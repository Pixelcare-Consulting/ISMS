"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createColumnHelper } from "@tanstack/react-table";
import { toast } from "sonner";

import {
  addAllowedModelAction,
  listModelCandidatesForAllowedListAction,
  removeAllowedModelAction,
} from "@/features/planogram/actions/planogram.actions";
import {
  DeleteConfirmDialog,
  TableRowActions,
  TableStatusBadge,
  uniqueSearchSuggestions,
} from "@/components/data-table";
import {
  DataTable,
  useClientTableSort,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
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

const allowedColumn = createColumnHelper<DataTableFeatures, AllowedModelRow>();

interface AllowedModelRow {
  id: string;
  modelId: string;
  effectiveFrom?: string | null;
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

export function AllowedModelsPanel({
  branchId,
  rows,
  canManage,
}: {
  branchId: string;
  rows: AllowedModelRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [removing, setRemoving] = useState<AllowedModelRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [candidates, setCandidates] = useState<
    { id: string; skuCode: string; name: string }[]
  >([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [candidateQuery, setCandidateQuery] = useState("");
  const [loadingCandidates, setLoadingCandidates] = useState(false);

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
    status: (row) => row.model.status,
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

  const filteredCandidates = useMemo(
    () =>
      candidates.filter((c) => matchesTableSearch(candidateQuery, [c.skuCode, c.name])),
    [candidates, candidateQuery],
  );

  const allFilteredSelected =
    filteredCandidates.length > 0 &&
    filteredCandidates.every((c) => selectedIds.has(c.id));

  const columns = useMemo(() => {
    const cols: DataTableColumn<AllowedModelRow>[] = [
      allowedColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => row.index + 1,
        meta: { className: "tabular-nums text-muted-foreground" },
      }),
      allowedColumn.display({
        id: "sku",
        header: "SKU",
        enableSorting: true,
        cell: ({ row }) => row.original.model.skuCode,
        meta: { className: "font-mono text-sm" },
      }),
      allowedColumn.display({
        id: "model",
        header: "Model",
        enableSorting: true,
        cell: ({ row }) => row.original.model.name,
      }),
      allowedColumn.display({
        id: "series",
        header: "Series",
        enableSorting: true,
        cell: ({ row }) => row.original.model.series ?? "—",
      }),
      allowedColumn.display({
        id: "srp",
        header: "SRP",
        enableSorting: true,
        cell: ({ row }) => formatPeso(row.original.model.srp),
        meta: { className: "tabular-nums" },
      }),
      allowedColumn.display({
        id: "brand",
        header: "Brand",
        enableSorting: true,
        cell: ({ row }) => row.original.model.brand?.name ?? "—",
      }),
      allowedColumn.display({
        id: "effective",
        header: "Effective",
        enableSorting: true,
        cell: ({ row }) => row.original.effectiveFrom ?? "—",
        meta: { className: "text-sm text-muted-foreground" },
      }),
      allowedColumn.display({
        id: "status",
        header: "Status",
        enableSorting: true,
        cell: ({ row }) => <TableStatusBadge status={row.original.model.status} />,
      }),
    ];
    if (canManage) {
      cols.push(
        allowedColumn.display({
          id: "actions",
          header: "",
          enableSorting: false,
          cell: ({ row }) => (
            <TableRowActions
              asCell={false}
              onDelete={() => setRemoving(row.original)}
              deleteDisabled={pending}
              deleteTitle="Remove from allow-list"
            />
          ),
          meta: { align: "end" },
        }),
      );
    }
    return cols;
  }, [canManage, pending]);

  useEffect(() => {
    if (!addOpen) return;

    let cancelled = false;

    void (async () => {
      try {
        const list = await listModelCandidatesForAllowedListAction(branchId);
        if (cancelled) return;
        setCandidates(list.map((m) => ({ id: m.id, skuCode: m.skuCode, name: m.name })));
      } catch (error) {
        if (cancelled) return;
        toast.error(error instanceof Error ? error.message : "Failed to load models");
        setCandidates([]);
      } finally {
        if (!cancelled) setLoadingCandidates(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [addOpen, branchId]);

  function handleAddOpenChange(next: boolean) {
    if (pending) return;
    setAddOpen(next);
    if (next) {
      setLoadingCandidates(true);
      setSelectedIds(new Set());
      setCandidateQuery("");
      setCandidates([]);
      return;
    }
    setCandidateQuery("");
    setSelectedIds(new Set());
  }

  function toggleCandidate(id: string, checked: boolean) {
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
      for (const c of filteredCandidates) {
        if (checked) next.add(c.id);
        else next.delete(c.id);
      }
      return next;
    });
  }

  function handleAdd() {
    if (selectedIds.size === 0) return;
    const modelIds = [...selectedIds];
    startTransition(async () => {
      const results = await Promise.all(
        modelIds.map((modelId) => addAllowedModelAction({ branchId, modelId })),
      );
      const failed = results.filter((r) => r.error);
      if (failed.length > 0) {
        toast.error(`${failed.length} of ${modelIds.length} models failed to add`);
      } else {
        toast.success(
          `${modelIds.length} model${modelIds.length === 1 ? "" : "s"} added to allow-list`,
        );
      }
      setAddOpen(false);
      setSelectedIds(new Set());
      setCandidateQuery("");
      router.refresh();
    });
  }

  function handleRemove() {
    if (!removing) return;
    startTransition(async () => {
      const result = await removeAllowedModelAction({
        branchId,
        modelId: removing.modelId,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Model removed from allow-list");
      setRemoving(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Only models on this list can be added to the branch planogram. Special orders are
        not affected.
      </p>

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
            <Button
              size="sm"
              variant="outline"
              type="button"
              onClick={() => handleAddOpenChange(true)}
            >
              Add to allow-list
            </Button>
          ) : null
        }
        empty={sort.sorted.length === 0}
        emptyMessage={
          rows.length === 0
            ? "No allowed models configured for this branch yet."
            : "No models match your search."
        }
      />

      <Dialog open={addOpen} onOpenChange={handleAddOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add to allow-list</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Select active models that are not yet on this branch&apos;s allow-list.
            </p>
            <Input
              placeholder="Search models…"
              value={candidateQuery}
              onChange={(e) => setCandidateQuery(e.target.value)}
              className="h-8"
              disabled={loadingCandidates || pending}
            />
            <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
              <Checkbox
                checked={allFilteredSelected}
                onCheckedChange={(checked) => toggleSelectAllFiltered(Boolean(checked))}
                disabled={loadingCandidates || filteredCandidates.length === 0 || pending}
                aria-label="Select all filtered models"
              />
              <Label className="text-xs text-muted-foreground">
                Select all ({filteredCandidates.length})
              </Label>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-md border">
              {loadingCandidates ? (
                <p className="px-3 py-4 text-sm text-muted-foreground">Loading models…</p>
              ) : filteredCandidates.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground">
                  {candidates.length === 0
                    ? "No models left to add to the allow-list."
                    : "No matching models."}
                </p>
              ) : (
                filteredCandidates.map((c) => (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0 hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={selectedIds.has(c.id)}
                      onCheckedChange={(checked) =>
                        toggleCandidate(c.id, Boolean(checked))
                      }
                      disabled={pending}
                      aria-label={`Select ${c.skuCode}`}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-mono">{c.skuCode}</span> — {c.name}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleAddOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              disabled={pending || loadingCandidates || selectedIds.size === 0}
              onClick={handleAdd}
            >
              Add {selectedIds.size > 0 ? selectedIds.size : ""} to allow-list
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove from allow-list?"
        description={
          removing
            ? `Remove ${removing.model.skuCode} (${removing.model.name}) from this branch's allowed models? This is blocked while the model is still on the planogram or has open orders.`
            : "Remove this model from the allow-list?"
        }
        confirmLabel="Remove"
        onConfirm={handleRemove}
        pending={pending}
      />
    </div>
  );
}
