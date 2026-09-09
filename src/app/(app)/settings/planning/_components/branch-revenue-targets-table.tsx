"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import {
  createPlanningTargetAction,
  deletePlanningTargetAction,
  deletePlanningTargetsAction,
  updatePlanningTargetAction,
} from "@/features/forecast/actions/forecast.actions";
import {
  DeleteConfirmDialog,
  TableEmptyRow,
  TableIndexCell,
  TableIndexHead,
  TableRowActions,
  uniqueSearchSuggestions,
  useClientTablePagination,
  useTableSelection,
} from "@/components/data-table";
import { GlobalDataTable, GlobalTableHead, useClientTableSort } from "@/lib/data-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/utils/cn";
import { matchesTableSearch } from "@/utils/match-table-search";

export interface PlanningTargetRow {
  id: string;
  branchId: string;
  revenueTarget: number;
  revenueLabel: string;
  branch: { name: string; sapCode: string };
}

export interface PlanningBranchOption {
  id: string;
  name: string;
  sapCode: string;
}

const COL_COUNT = 6;

interface BranchRevenueTargetsTableProps {
  periodId: string;
  targets: PlanningTargetRow[];
  branches: PlanningBranchOption[];
}

export function BranchRevenueTargetsTable({
  periodId,
  targets,
  branches,
}: BranchRevenueTargetsTableProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<PlanningTargetRow | null>(null);
  const [deleting, setDeleting] = useState<PlanningTargetRow | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [branchId, setBranchId] = useState("");
  const [revenueTarget, setRevenueTarget] = useState("");

  const assignedBranchIds = useMemo(
    () => new Set(targets.map((target) => target.branchId)),
    [targets],
  );
  const availableBranches = useMemo(
    () => branches.filter((branch) => !assignedBranchIds.has(branch.id)),
    [branches, assignedBranchIds],
  );

  const filtered = useMemo(
    () =>
      targets.filter((row) =>
        matchesTableSearch(query, [
          row.branch.name,
          row.branch.sapCode,
          row.revenueLabel,
          String(row.revenueTarget),
        ]),
      ),
    [targets, query],
  );

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        targets.map((row) => row.branch.name),
        targets.map((row) => row.branch.sapCode),
      ),
    [targets],
  );

  const sort = useClientTableSort(filtered, {
    branch: (row) => row.branch.name,
    sap: (row) => row.branch.sapCode,
    target: (row) => row.revenueTarget,
  });
  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    total,
    totalPages,
    pageItems,
    indexOffset,
  } = useClientTablePagination(sort.sorted, {
    resetKey: `${query}:${sort.sortKey}:${sort.sortDir}`,
  });
  const selection = useTableSelection(sort.sorted.map((row) => row.id));

  function openCreate() {
    setEditing(null);
    setBranchId("");
    setRevenueTarget("");
    setSheetOpen(true);
  }

  function openEdit(row: PlanningTargetRow) {
    setEditing(row);
    setBranchId(row.branchId);
    setRevenueTarget(String(row.revenueTarget));
    setSheetOpen(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = editing
        ? await updatePlanningTargetAction({
            id: editing.id,
            revenueTarget: Number(revenueTarget),
          })
        : await createPlanningTargetAction({
            periodId,
            branchId,
            revenueTarget: Number(revenueTarget),
          });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(editing ? "Target updated" : "Target added");
      setSheetOpen(false);
      router.refresh();
    });
  }

  function handleDelete() {
    if (!deleting) return;
    startTransition(async () => {
      const result = await deletePlanningTargetAction({ id: deleting.id });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Target removed");
      setDeleting(null);
      selection.clearSelection();
      router.refresh();
    });
  }

  function handleBulkDelete() {
    const ids = selection.selectedIds;
    if (ids.length === 0) return;
    startTransition(async () => {
      const result = await deletePlanningTargetsAction({ ids });
      if ("deleted" in result) {
        toast.success(
          result.deleted === 1 ? "Target removed" : `${result.deleted} targets removed`,
        );
        setBulkOpen(false);
        selection.clearSelection();
        router.refresh();
        return;
      }
      toast.error(result.error);
    });
  }

  return (
    <div id="branch-targets" className="scroll-mt-24 space-y-4">
      <GlobalDataTable
        stickyHeader
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search branch, SAP, or amount…",
          suggestions,
        }}
        toolbarLeading={
          <span className="text-sm font-medium">Branch revenue targets</span>
        }
        toolbarActions={
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link href="/planning/suggested-orders">View suggested orders</Link>
            </Button>
            {selection.selectedCount > 0 ? (
              <Button
                variant="destructive"
                size="sm"
                disabled={pending}
                onClick={() => setBulkOpen(true)}
              >
                Remove selected ({selection.selectedCount})
              </Button>
            ) : null}
            <Button size="sm" onClick={openCreate} disabled={pending}>
              <Plus className="size-4" />
              Add target
            </Button>
          </div>
        }
        empty={targets.length === 0}
        emptyMessage="No branch revenue targets for this period. Add a target or Import forecast."
        pageSize={{ value: pageSize, onChange: setPageSize }}
        pagination={{
          total,
          page,
          totalPages,
          itemLabel: "target",
          onPageChange: setPage,
        }}
      >
        <TableHeader>
          <TableRow>
            <GlobalTableHead className="w-10">
              <Checkbox
                checked={
                  selection.isAllSelected ||
                  (selection.isPartiallySelected ? "indeterminate" : false)
                }
                onCheckedChange={(checked) => selection.toggleAll(checked === true)}
                aria-label="Select all revenue targets"
              />
            </GlobalTableHead>
            <TableIndexHead />
            <GlobalTableHead {...sort.sortProps("branch")}>Branch</GlobalTableHead>
            <GlobalTableHead {...sort.sortProps("sap")}>SAP</GlobalTableHead>
            <GlobalTableHead className="text-right" {...sort.sortProps("target")}>
              Target
            </GlobalTableHead>
            <GlobalTableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableEmptyRow colSpan={COL_COUNT} message="No results match your search." />
          ) : (
            pageItems.map((row, index) => (
              <TableRow
                key={row.id}
                className={cn(index % 2 === 1 && "bg-table-stripe")}
                data-state={selection.isRowSelected(row.id) ? "selected" : undefined}
              >
                <TableCell>
                  <Checkbox
                    checked={selection.isRowSelected(row.id)}
                    onCheckedChange={(checked) =>
                      selection.toggleRow(row.id, checked === true)
                    }
                    aria-label={`Select target for ${row.branch.name}`}
                  />
                </TableCell>
                <TableIndexCell index={indexOffset + index + 1} />
                <TableCell className="font-medium">{row.branch.name}</TableCell>
                <TableCell className="font-mono text-sm">{row.branch.sapCode}</TableCell>
                <TableCell className="text-right tabular-nums">{row.revenueLabel}</TableCell>
                <TableRowActions
                  onEdit={() => openEdit(row)}
                  editDisabled={pending}
                  onDelete={() => setDeleting(row)}
                  deleteDisabled={pending}
                />
              </TableRow>
            ))
          )}
        </TableBody>
      </GlobalDataTable>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
        >
          <SheetHeader className="border-b border-border/60 px-4 py-4 text-left">
            <SheetTitle>{editing ? "Edit target" : "Add target"}</SheetTitle>
            <SheetDescription>
              {editing
                ? "Update the revenue target for this branch. Branch cannot be changed."
                : "Set a peso revenue target for one branch in this period. Use Import forecast for many branches."}
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {editing ? (
                <div className="space-y-2">
                  <Label htmlFor="target-branch">Branch</Label>
                  <Input
                    id="target-branch"
                    value={`${editing.branch.sapCode} — ${editing.branch.name}`}
                    disabled
                  />
                </div>
              ) : (
                <SearchableSelect
                  label="Branch"
                  options={availableBranches.map((branch) => ({
                    id: branch.id,
                    label: `${branch.sapCode} — ${branch.name}`,
                  }))}
                  value={branchId}
                  onChange={setBranchId}
                  placeholder="Select branch…"
                  searchPlaceholder="Search branches…"
                  emptyMessage="Every branch already has a target for this period."
                  disabled={pending}
                />
              )}
              <div className="space-y-2">
                <Label htmlFor="target-amount">Revenue target (₱)</Label>
                <Input
                  id="target-amount"
                  type="number"
                  min={1}
                  step="0.01"
                  value={revenueTarget}
                  onChange={(e) => setRevenueTarget(e.target.value)}
                  required
                  disabled={pending}
                />
              </div>
            </div>
            <SheetFooter className="border-t border-border/60">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSheetOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={pending || (!editing && !branchId)}
              >
                {pending ? "Saving…" : editing ? "Save" : "Add target"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <DeleteConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Remove target?"
        description={
          deleting
            ? `Remove the revenue target for ${deleting.branch.name}?`
            : "Remove this revenue target?"
        }
        confirmLabel="Remove"
        onConfirm={handleDelete}
        pending={pending}
      />

      <DeleteConfirmDialog
        open={bulkOpen}
        onOpenChange={(open) => !open && setBulkOpen(false)}
        title="Remove selected targets?"
        description={`Remove ${selection.selectedCount} branch revenue target${
          selection.selectedCount === 1 ? "" : "s"
        } from this period?`}
        confirmLabel="Remove"
        onConfirm={handleBulkDelete}
        pending={pending}
      />
    </div>
  );
}
