"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { NewRunDialog } from "@/app/(app)/planning/_components/new-run-dialog";
import { RunDocumentDialog } from "@/app/(app)/planning/_components/run-document-dialog";
import {
  DeleteConfirmDialog,
  TableIndexCell,
  TableIndexHead,
  TableRowActions,
  TableRowCheckbox,
  TableSelectAllCheckbox,
  TableSelectionBadge,
  useTableSelection,
} from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { GlobalDataTable } from "@/lib/data-table";
import { KpiCard } from "@/lib/kpi-cards";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

  return (
    <div className="space-y-4">
      <div className="responsive-card-grid">
        <KpiCard label="Runs" value={String(total)} />
        <KpiCard label="Released" value={String(released)} />
        <KpiCard label="Drop 1 units (this page)" value={String(drop1Qty)} />
        <KpiCard label="Drop 1 ₱ (this page)" value={formatDemandPeso(drop1Peso)} />
      </div>

      <GlobalDataTable
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
      >
        <TableHeader>
          <TableRow>
            {canManage ? (
              <TableSelectAllCheckbox
                isAllSelected={selection.isAllSelected}
                isPartiallySelected={selection.isPartiallySelected}
                onToggleAll={selection.toggleAll}
                aria-label="Select all deletable runs"
              />
            ) : null}
            <TableIndexHead />
            <TableHead>Document</TableHead>
            <TableHead>Period</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Branches</TableHead>
            <TableHead className="text-right">Drop 1</TableHead>
            <TableHead className="text-right">Drop 1 ₱</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Created by</TableHead>
            {canManage ? <TableHead className="w-16 text-right">Actions</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item, rowIndex) => {
            const deletable = isDemandPlanningRunDeletable(item.status);
            return (
              <TableRow
                key={item.id}
                data-state={selection.isRowSelected(item.id) ? "selected" : undefined}
              >
                {canManage ? (
                  <TableRowCheckbox
                    checked={selection.isRowSelected(item.id)}
                    disabled={!deletable}
                    onCheckedChange={(checked) => {
                      if (!deletable) return;
                      selection.toggleRow(item.id, checked);
                    }}
                    aria-label={
                      deletable
                        ? `Select ${item.documentNumber}`
                        : `Released run ${item.documentNumber} cannot be selected`
                    }
                  />
                ) : null}
                <TableIndexCell index={(page - 1) * limit + rowIndex + 1} />
                <TableCell>
                  <button
                    type="button"
                    className="cursor-pointer text-left font-medium hover:underline"
                    onClick={() => openDocument(item.id)}
                  >
                    {item.documentNumber}
                  </button>
                  {item.originalDocumentNumber ? (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Original {item.originalDocumentNumber}
                    </span>
                  ) : null}
                  {item.name ? (
                    <span className="mt-0.5 block text-xs text-muted-foreground">{item.name}</span>
                  ) : null}
                  {item.version > 1 ? (
                    <Badge variant="outline" className="mt-1">
                      v{item.version}
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell>{item.periodLabel}</TableCell>
                <TableCell>
                  <DemandPlanningRunStatusBadge status={item.status} />
                </TableCell>
                <TableCell>
                  {item.plannedBranchCount}/{item.branchCount} planned
                </TableCell>
                <TableCell className="text-right tabular-nums">{item.drop1Qty}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatDemandPeso(item.drop1Peso)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(item.createdAt).toLocaleString("en-PH", { dateStyle: "medium" })}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {item.createdByName ?? "—"}
                </TableCell>
                {canManage ? (
                  deletable ? (
                    <TableRowActions
                      onDelete={() => setDeleteTarget({ mode: "single", item })}
                      deleteDisabled={pending}
                      deleteTitle={`Delete ${item.documentNumber}`}
                    />
                  ) : (
                    <TableCell className="text-right text-muted-foreground">—</TableCell>
                  )
                ) : null}
              </TableRow>
            );
          })}
        </TableBody>
      </GlobalDataTable>

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
