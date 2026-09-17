"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { NewRunDialog } from "@/app/(app)/planning/_components/new-run-dialog";
import { RunDocumentDialog } from "@/app/(app)/planning/_components/run-document-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DemandPlanningRunStatusBadge } from "@/features/demand-planning/components/demand-planning-status-badge";
import { formatDemandPeso } from "@/features/demand-planning/lib/format-demand-plan";
import { demandPlanningRunsHref } from "@/features/demand-planning/lib/paths";
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

export function DemandPlanningRunList({
  items,
  total,
  page,
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
  const [newRunOpen, setNewRunOpen] = useState(initialNewRunOpen && !initialRunId);
  const [activeRunId, setActiveRunId] = useState<string | null>(initialRunId);
  const released = items.filter((item) => item.status === "released").length;
  const drop1Qty = items.reduce((sum, item) => sum + item.drop1Qty, 0);
  const drop1Peso = items.reduce((sum, item) => sum + item.drop1Peso, 0);

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
    setNewRunOpen(false);
    setActiveRunId(runId);
    router.replace(hrefFor(page, selectedPeriodId, runId), { scroll: false });
  }

  function handleNewRunOpenChange(open: boolean) {
    setNewRunOpen(open);
    if (open) {
      setActiveRunId(null);
      router.replace(hrefFor(page), { scroll: false });
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
        emptyMessage="No demand planning runs yet. Start a new run after the SFE forecast is in."
        toolbarLeading={
          <SearchableSelect
            className="w-56"
            options={periods.map((period) => ({
              id: period.id,
              label: period.isActive ? `${period.label} (active)` : period.label,
            }))}
            value={selectedPeriodId ?? ""}
            onChange={(periodId) => router.push(hrefFor(1, periodId || undefined))}
            placeholder="All periods"
            allowClear
          />
        }
        toolbarActions={
          canManage && wizardOptions ? (
            <Button
              type="button"
              onClick={() => {
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
            <TableHead>Document</TableHead>
            <TableHead>Period</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Branches</TableHead>
            <TableHead className="text-right">Drop 1</TableHead>
            <TableHead className="text-right">Drop 1 ₱</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
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
            </TableRow>
          ))}
        </TableBody>
      </GlobalDataTable>

      {wizardOptions && actorName ? (
        <NewRunDialog
          open={newRunOpen}
          onOpenChange={handleNewRunOpenChange}
          actorName={actorName}
          periods={wizardOptions.periods}
          dealers={wizardOptions.dealers}
          branches={wizardOptions.branches}
          onOpenDocument={(runId) => {
            router.refresh();
            openDocument(runId);
          }}
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
