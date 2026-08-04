"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  addAllowedModelAction,
  listModelCandidatesForAllowedListAction,
  removeAllowedModelAction,
} from "@/features/planogram/actions/planogram.actions";
import { ChevronsUpDown } from "lucide-react";

import { DeleteConfirmDialog, TableEmptyRow } from "@/components/data-table";
import { GlobalTableHead, useClientTableSort } from "@/lib/data-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { matchesTableSearch } from "@/utils/match-table-search";
import { cn } from "@/utils/cn";

interface AllowedModelRow {
  id: string;
  modelId: string;
  model: { id: string; skuCode: string; name: string; status: string };
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
  const [candidates, setCandidates] = useState<
    { id: string; skuCode: string; name: string }[]
  >([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [candidateQuery, setCandidateQuery] = useState("");
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const filtered = useMemo(
    () =>
      rows.filter((row) =>
        matchesTableSearch(query, [row.model.skuCode, row.model.name]),
      ),
    [rows, query],
  );

  const sort = useClientTableSort(filtered, {
    sku: (row) => row.model.skuCode,
    model: (row) => row.model.name,
    status: (row) => row.model.status,
  });

  const filteredCandidates = useMemo(
    () =>
      candidates.filter((c) => matchesTableSearch(candidateQuery, [c.skuCode, c.name])),
    [candidates, candidateQuery],
  );

  const allFilteredSelected =
    filteredCandidates.length > 0 &&
    filteredCandidates.every((c) => selectedIds.has(c.id));

  async function loadCandidates() {
    setLoadingCandidates(true);
    try {
      const list = await listModelCandidatesForAllowedListAction(branchId);
      setCandidates(list.map((m) => ({ id: m.id, skuCode: m.skuCode, name: m.name })));
    } finally {
      setLoadingCandidates(false);
    }
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
        toast.success(`${modelIds.length} model${modelIds.length === 1 ? "" : "s"} added to allow-list`);
      }
      setCandidates((prev) => prev.filter((m) => !selectedIds.has(m.id)));
      setSelectedIds(new Set());
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

      {canManage ? (
        <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center">
          {candidates.length === 0 ? (
            <Button
              variant="outline"
              type="button"
              disabled={loadingCandidates}
              onClick={loadCandidates}
            >
              Load models
            </Button>
          ) : (
            <>
              <Popover
                modal
                open={dropdownOpen}
                onOpenChange={(next) => {
                  setDropdownOpen(next);
                  if (!next) setCandidateQuery("");
                }}
              >
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={dropdownOpen}
                    className="h-9 w-full justify-between border-input bg-background font-normal shadow-sm sm:max-w-sm"
                  >
                    <span
                      className={cn(
                        "truncate text-left",
                        selectedIds.size === 0 && "text-muted-foreground",
                      )}
                    >
                      {selectedIds.size > 0
                        ? `${selectedIds.size} model${selectedIds.size === 1 ? "" : "s"} selected`
                        : "Select models…"}
                    </span>
                    <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-(--radix-popover-trigger-width) p-0"
                  align="start"
                >
                  <div className="border-b p-2">
                    <Input
                      placeholder="Search models…"
                      value={candidateQuery}
                      onChange={(e) => setCandidateQuery(e.target.value)}
                      className="h-8"
                    />
                  </div>
                  <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
                    <Checkbox
                      checked={allFilteredSelected}
                      onCheckedChange={(checked) => toggleSelectAllFiltered(Boolean(checked))}
                      aria-label="Select all filtered models"
                    />
                    <Label className="text-xs text-muted-foreground">
                      Select all ({filteredCandidates.length})
                    </Label>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {filteredCandidates.length === 0 ? (
                      <p className="px-3 py-4 text-sm text-muted-foreground">
                        No matching models.
                      </p>
                    ) : (
                      filteredCandidates.map((c) => (
                        <label
                          key={c.id}
                          className="flex cursor-pointer items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0 hover:bg-muted/40"
                        >
                          <Checkbox
                            checked={selectedIds.has(c.id)}
                            onCheckedChange={(checked) => toggleCandidate(c.id, Boolean(checked))}
                            aria-label={`Select ${c.skuCode}`}
                          />
                          <span className="min-w-0 flex-1 truncate">
                            <span className="font-mono">{c.skuCode}</span> — {c.name}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              <Button disabled={pending || selectedIds.size === 0} onClick={handleAdd}>
                Add {selectedIds.size > 0 ? selectedIds.size : ""} to allow-list
              </Button>
            </>
          )}
        </div>
      ) : null}

      <div className="max-w-sm">
        <Input
          placeholder="Search by SKU or model name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <GlobalTableHead {...sort.sortProps("sku")}>SKU</GlobalTableHead>
            <GlobalTableHead {...sort.sortProps("model")}>Model</GlobalTableHead>
            <GlobalTableHead {...sort.sortProps("status")}>Status</GlobalTableHead>
            {canManage ? <TableHead className="w-24" /> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sort.sorted.length === 0 ? (
            <TableEmptyRow
              colSpan={canManage ? 4 : 3}
              message={
                rows.length === 0
                  ? "No allowed models configured for this branch yet."
                  : "No models match your search."
              }
            />
          ) : (
            sort.sorted.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-mono text-sm">{row.model.skuCode}</TableCell>
                <TableCell>{row.model.name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {row.model.status}
                </TableCell>
                {canManage ? (
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => setRemoving(row)}
                    >
                      Remove
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

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
