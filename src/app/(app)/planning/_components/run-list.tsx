"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createColumnHelper } from "@tanstack/react-table";
import { toast } from "sonner";

import { NewRunDialog } from "@/app/(app)/planning/_components/new-run-dialog";
import { RunDocumentDialog } from "@/app/(app)/planning/_components/run-document-dialog";
import {
  DeleteConfirmDialog,
  TableRowActions,
  TableSelectionBadge,
  useTableSelection,
} from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  deleteDemandPlanRunAction,
  deleteDemandPlanRunsAction,
} from "@/features/demand-planning/actions/demand-planning.actions";
import { DemandPlanningRunStatusBadge } from "@/features/demand-planning/components/demand-planning-status-badge";
import { formatDemandPeso } from "@/features/demand-planning/lib/format-demand-plan";
import { demandPlanningRunsHref } from "@/features/demand-planning/lib/paths";
import { displayPeriodLabel } from "@/features/demand-planning/lib/planning-period-dates";
import { isDemandPlanningRunDeletable } from "@/features/demand-planning/lib/run-lifecycle";
import type {
  DemandPlanningClientRunListItem,
  DemandPlanningWizardBranch,
  DemandPlanningWizardDealer,
  DemandPlanningWizardPeriod,
} from "@/features/demand-planning/types/run.types";
import {
  DataTable,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
import { KpiCard } from "@/lib/kpi-cards";

const runColumn = createColumnHelper<DataTableFeatures, DemandPlanningClientRunListItem>();

type DeleteTarget =
  | { mode: "single"; item: DemandPlanningClientRunListItem }
  | { mode: "bulk"; runIds: string[] };

export function DemandPlanningRunList({
  items,
  total,
  page,
  limit,
  totalPages,
  periods,
  selectedPeriodId,
  canManage,
  canRelease = false,
  actorName,
  wizardOptions,
  initialNewRunOpen = false,
  initialRunId = null,
}: {
  items: DemandPlanningClientRunListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  periods: Array<{ id: string; label: string; isActive: boolean }>;
  selectedPeriodId?: string;
  canManage: boolean;
  canRelease?: boolean;
  actorName?: string;
  wizardOptions?: {
    periods: DemandPlanningWizardPeriod[];
    dealers: DemandPlanningWizardDealer[];
    branches: DemandPlanningWizardBranch[];
  };
  initialNewRunOpen?: boolean;
  initialRunId?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [newRunOpen, setNewRunOpen] = useState(initialNewRunOpen && !initialRunId);
  const [activeRunId, setActiveRunId] = useState<string | null>(initialRunId);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const skipNewRunCloseRefreshRef = useRef(false);
  const released = items.filter((item) => item.status === "released").length;
  const drop1Qty = items.reduce((sum, item) => sum + item.drop1Qty, 0);
  const drop1Peso = items.reduce((sum, item) => sum + item.drop1Peso, 0);

  const deletableIds = useMemo(
    () =>
      canManage
        ? items
            .filter((item) => isDemandPlanningRunDeletable(item.status))
            .map((item) => item.id)
        : [],
    [canManage, items],
  );
  const deletableIdSet = useMemo(() => new Set(deletableIds), [deletableIds]);
  const selection = useTableSelection(deletableIds);
  const selectedDeletableIds = useMemo(
    () => selection.selectedIds.filter((id) => deletableIdSet.has(id)),
    [deletableIdSet, selection.selectedIds],
  );

  const hrefFor = useCallback(
    (nextPage: number, period = selectedPeriodId, runId?: string | null) => {
      return demandPlanningRunsHref({
        page: nextPage,
        period,
        run: runId,
      });
    },
    [selectedPeriodId],
  );

  useEffect(() => {
    if (!initialNewRunOpen) return;
    router.replace(hrefFor(page), { scroll: false });
  }, [initialNewRunOpen, page, hrefFor, router]);

  function openDocument(runId: string) {
    skipNewRunCloseRefreshRef.current = true;
    setNewRunOpen(false);
    setActiveRunId(runId);
    router.replace(hrefFor(page, selectedPeriodId, runId), { scroll: false });
  }

  function handleNewRunOpenChange(open: boolean) {
    setNewRunOpen(open);
    if (open) {
      skipNewRunCloseRefreshRef.current = false;
      setActiveRunId(null);
      router.replace(hrefFor(page), { scroll: false });
      return;
    }
    // Closing New run after Open document — keep ?run= and skip refresh (avoids stuck loading).
    if (skipNewRunCloseRefreshRef.current) {
      skipNewRunCloseRefreshRef.current = false;
      return;
    }
    router.refresh();
  }

  function handleRunOpenChange(open: boolean) {
    if (open) return;
    setActiveRunId(null);
    router.replace(hrefFor(page), { scroll: false });
    router.refresh();
  }

  function handleRunChanged(nextRunId: string) {
    setActiveRunId(nextRunId);
    router.replace(hrefFor(page, selectedPeriodId, nextRunId), { scroll: false });
    router.refresh();
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;

    switch (deleteTarget.mode) {
      case "single": {
        const runId = deleteTarget.item.id;
        startTransition(async () => {
          const result = await deleteDemandPlanRunAction(runId);
          if (!("success" in result)) {
            toast.error(result.error);
            return;
          }
          toast.success(`Deleted ${result.documentNumber}`);
          setDeleteTarget(null);
          selection.clearSelection();
          if (activeRunId === runId) {
            setActiveRunId(null);
            router.replace(hrefFor(page), { scroll: false });
          }
          router.refresh();
        });
        return;
      }
      case "bulk": {
        const runIds = deleteTarget.runIds;
        if (runIds.length === 0) return;

        startTransition(async () => {
          const result = await deleteDemandPlanRunsAction(runIds);
          if (!("success" in result)) {
            toast.error(result.error);
            return;
          }
          const deletedLabel = `Deleted ${result.deleted} run${result.deleted === 1 ? "" : "s"}`;
          toast.success(
            result.skipped > 0
              ? `${deletedLabel}, skipped ${result.skipped}`
              : deletedLabel,
          );
          setDeleteTarget(null);
          selection.clearSelection();
          if (activeRunId && runIds.includes(activeRunId)) {
            setActiveRunId(null);
            router.replace(hrefFor(page), { scroll: false });
          }
          router.refresh();
        });
        return;
      }
      default: {
        const _exhaustive: never = deleteTarget;
        return _exhaustive;
      }
    }
  }

  const deleteDescription =
    deleteTarget?.mode === "single"
      ? `Delete ${deleteTarget.item.documentNumber}${
          deleteTarget.item.name ? ` (${deleteTarget.item.name})` : ""
        }? This removes the run and its grid data. Released runs cannot be deleted.`
      : deleteTarget?.mode === "bulk"
        ? `Delete ${deleteTarget.runIds.length} selected run${
            deleteTarget.runIds.length === 1 ? "" : "s"
          }? This removes each draft run and its grid data. Released runs stay protected.`
        : "Delete this supply planning run?";

  const indexOffset = (page - 1) * limit;

  const columns = useMemo(() => {
    const cols: DataTableColumn<DemandPlanningClientRunListItem>[] = [];
    if (canManage) {
      cols.push(
        runColumn.display({
          id: "select",
          header: () => (
            <Checkbox
              checked={
                selection.isAllSelected ||
                (selection.isPartiallySelected ? "indeterminate" : false)
              }
              onCheckedChange={(checked) => selection.toggleAll(checked === true)}
              aria-label="Select all deletable runs"
            />
          ),
          enableSorting: false,
          cell: ({ row }) => {
            const deletable = isDemandPlanningRunDeletable(row.original.status);
            return (
              <Checkbox
                checked={selection.isRowSelected(row.original.id)}
                disabled={!deletable}
                onCheckedChange={(checked) => {
                  if (!deletable) return;
                  selection.toggleRow(row.original.id, checked === true);
                }}
                aria-label={
                  deletable
                    ? `Select ${row.original.documentNumber}`
                    : `Released run ${row.original.documentNumber} cannot be selected`
                }
              />
            );
          },
          meta: { className: "w-12" },
        }),
      );
    }
    cols.push(
      runColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => indexOffset + row.index + 1,
        meta: { className: "tabular-nums text-muted-foreground" },
      }),
      runColumn.display({
        id: "document",
        header: "Document",
        enableSorting: false,
        cell: ({ row }) => (
          <div>
            <button
              type="button"
              className="cursor-pointer text-left font-medium hover:underline"
              onClick={() => openDocument(row.original.id)}
            >
              {row.original.documentNumber}
            </button>
            {row.original.originalDocumentNumber ? (
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Original {row.original.originalDocumentNumber}
              </span>
            ) : null}
            {row.original.name ? (
              <span className="mt-0.5 block text-xs text-muted-foreground">{row.original.name}</span>
            ) : null}
            {row.original.version > 1 ? (
              <Badge variant="outline" className="mt-1">
                v{row.original.version}
              </Badge>
            ) : null}
          </div>
        ),
      }),
      runColumn.accessor("periodLabel", { header: "Period", enableSorting: false }),
      runColumn.display({
        id: "status",
        header: "Status",
        enableSorting: false,
        cell: ({ row }) => <DemandPlanningRunStatusBadge status={row.original.status} />,
      }),
      runColumn.display({
        id: "branches",
        header: "Branches",
        enableSorting: false,
        cell: ({ row }) => `${row.original.plannedBranchCount}/${row.original.branchCount} planned`,
      }),
      runColumn.display({
        id: "drop1",
        header: "Drop 1",
        enableSorting: false,
        cell: ({ row }) => row.original.drop1Qty,
        meta: { align: "end", className: "tabular-nums" },
      }),
      runColumn.display({
        id: "drop1Peso",
        header: "Drop 1 ₱",
        enableSorting: false,
        cell: ({ row }) => formatDemandPeso(row.original.drop1Peso),
        meta: { align: "end", className: "tabular-nums" },
      }),
      runColumn.display({
        id: "created",
        header: "Created",
        enableSorting: false,
        cell: ({ row }) =>
          new Date(row.original.createdAt).toLocaleString("en-PH", { dateStyle: "medium" }),
        meta: { className: "text-muted-foreground" },
      }),
      runColumn.display({
        id: "createdBy",
        header: "Created by",
        enableSorting: false,
        cell: ({ row }) => row.original.createdByName ?? "—",
        meta: { className: "text-muted-foreground" },
      }),
    );
    if (canManage) {
      cols.push(
        runColumn.display({
          id: "actions",
          header: "Actions",
          enableSorting: false,
          cell: ({ row }) =>
            isDemandPlanningRunDeletable(row.original.status) ? (
              <TableRowActions
                asCell={false}
                onDelete={() => setDeleteTarget({ mode: "single", item: row.original })}
                deleteDisabled={pending}
                deleteTitle={`Delete ${row.original.documentNumber}`}
              />
            ) : (
              "—"
            ),
          meta: { align: "end", className: "text-muted-foreground" },
        }),
      );
    }
    return cols;
  }, [canManage, indexOffset, pending, selection]);

  return (
    <div className="space-y-4">
      <div className="responsive-card-grid">
        <KpiCard label="Runs" value={String(total)} />
        <KpiCard label="Released" value={String(released)} />
        <KpiCard label="Drop 1 units (this page)" value={String(drop1Qty)} />
        <KpiCard label="Drop 1 ₱ (this page)" value={formatDemandPeso(drop1Peso)} />
      </div>

      <DataTable
        data={items}
        columns={columns}
        getRowId={(row) => row.id}
        manualPagination
        stickyHeader
        empty={items.length === 0}
        emptyMessage="No supply planning runs yet. Start a new run after the SFE forecast is in."
        toolbarLeading={
          <div className="flex flex-wrap items-center gap-2">
            <SearchableSelect
              className="w-56"
              options={periods.map((period) => {
                const label = displayPeriodLabel(period.label);
                return {
                  id: period.id,
                  label: period.isActive ? `${label} (active)` : label,
                };
              })}
              value={selectedPeriodId ?? ""}
              onChange={(periodId) => router.push(hrefFor(1, periodId || undefined))}
              placeholder="All periods"
              allowClear
            />
            {canManage ? (
              <TableSelectionBadge
                count={selectedDeletableIds.length}
                onClear={selection.clearSelection}
                actions={
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={pending || selectedDeletableIds.length === 0}
                    onClick={() =>
                      setDeleteTarget({
                        mode: "bulk",
                        runIds: selectedDeletableIds,
                      })
                    }
                  >
                    Delete selected
                  </Button>
                }
              />
            ) : null}
          </div>
        }
        toolbarActions={
          canManage && wizardOptions ? (
            <Button
              type="button"
              onClick={() => {
                skipNewRunCloseRefreshRef.current = false;
                setActiveRunId(null);
                setNewRunOpen(true);
                router.replace(hrefFor(page), { scroll: false });
              }}
            >
              New run
            </Button>
          ) : null
        }
        pagination={{
          total,
          page,
          totalPages,
          itemLabel: "run",
          buildHref: (nextPage) => hrefFor(nextPage),
        }}
      />

      <DeleteConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setDeleteTarget(null);
        }}
        title={
          deleteTarget?.mode === "bulk"
            ? "Delete selected supply planning runs?"
            : "Delete supply planning run?"
        }
        description={deleteDescription}
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirm}
        pending={pending}
      />

      {wizardOptions && actorName ? (
        <NewRunDialog
          open={newRunOpen}
          onOpenChange={handleNewRunOpenChange}
          actorName={actorName}
          periods={wizardOptions.periods}
          dealers={wizardOptions.dealers}
          branches={wizardOptions.branches}
          onOpenDocument={openDocument}
        />
      ) : null}

      {actorName ? (
        <RunDocumentDialog
          runId={activeRunId}
          onOpenChange={handleRunOpenChange}
          onRunChanged={handleRunChanged}
          canManage={canManage}
          canRelease={canRelease}
          actorName={actorName}
        />
      ) : null}
    </div>
  );
}
