"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DemandPlanningGrid } from "@/features/demand-planning";
import { sendReplenishmentWorkbenchAction } from "@/features/demand-planning/actions/demand-planning-workbench.actions";
import type { DemandPlanQuotaMode } from "@/features/demand-planning";
import {
  applyWorkbenchFactOverride,
  drop1SelectedIds,
  resetWorkbenchFacts,
  safeComputeWorkbenchGrid,
  sumGridLineTotals,
} from "@/features/demand-planning/lib/workbench-grid";
import { formatDemandPeso } from "@/features/demand-planning/lib/format-demand-plan";
import type { WorkbenchBranchSnapshot } from "@/features/demand-planning/types/workbench.types";
import { KpiCard } from "@/lib/kpi-cards";

import { WorkbenchParameterRail } from "./workbench-parameter-rail";

export function ReplenishmentWorkbench({
  snapshot,
  periods,
  canManage,
  canSend,
}: {
  snapshot: WorkbenchBranchSnapshot;
  periods: Array<{ id: string; label: string; isActive: boolean }>;
  canManage: boolean;
  canSend: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [facts, setFacts] = useState(snapshot.facts);
  const [dropsPerMonth, setDropsPerMonth] = useState(snapshot.dropsPerMonth);
  const [quotaMode, setQuotaMode] = useState<DemandPlanQuotaMode>(snapshot.quotaMode);
  const [quotaPeso, setQuotaPeso] = useState(snapshot.quotaPeso);
  const [selectedLineIds, setSelectedLineIds] = useState<string[] | null>(null);
  const readOnly = !canManage;

  const { result, lines } = useMemo(
    () =>
      safeComputeWorkbenchGrid({
        facts,
        dropsPerMonth,
        quotaMode,
        quotaPeso,
        monthBasisDays: snapshot.monthBasisDays,
        roundUpToOne: snapshot.roundUpToOne,
        floorAllocationAtZero: snapshot.floorAllocationAtZero,
      }),
    [
      facts,
      dropsPerMonth,
      quotaMode,
      quotaPeso,
      snapshot.monthBasisDays,
      snapshot.roundUpToOne,
      snapshot.floorAllocationAtZero,
    ],
  );

  const effectiveSelectedIds = selectedLineIds ?? drop1SelectedIds(lines);
  const totals = sumGridLineTotals(lines);
  const selectedCount = effectiveSelectedIds.length;
  const canSubmitSend = canSend && Boolean(snapshot.releasedRun) && selectedCount > 0;

  function resetOverrides() {
    setFacts(resetWorkbenchFacts(snapshot.facts));
    setDropsPerMonth(snapshot.dropsPerMonth);
    setQuotaMode(snapshot.quotaMode);
    setQuotaPeso(snapshot.quotaPeso);
    setSelectedLineIds(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" asChild>
          <Link
            href={`/planning/replenishment${snapshot.periodId ? `?period=${snapshot.periodId}` : ""}`}
          >
            All branches
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          {canManage ? (
            <Button type="button" variant="outline" disabled={pending} onClick={resetOverrides}>
              Reset overrides
            </Button>
          ) : null}
          {canSend ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={pending || !canSubmitSend}>Send selected to Ordering</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Send a supplementary auto-replenish?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {snapshot.releasedRun
                      ? `Uses released ${snapshot.releasedRun.documentNumber} as the period plan. This does not change that frozen document. Zero-qty lines are skipped.`
                      : "Release a Demand Planning run for this period before sending."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={!snapshot.releasedRun}
                    onClick={() => {
                      startTransition(async () => {
                        const resultSend = await sendReplenishmentWorkbenchAction({
                          periodId: snapshot.periodId,
                          branchId: snapshot.branchId,
                          dropsPerMonth,
                          quotaMode,
                          quotaPeso,
                          selectedModelIds: effectiveSelectedIds,
                          overrides: facts.map((fact) => ({
                            modelId: fact.modelId,
                            displayUnits: fact.displayUnits,
                            forecastQty: fact.forecastQty,
                          })),
                        });
                        if ("error" in resultSend && resultSend.error) {
                          toast.error(resultSend.error);
                          return;
                        }
                        if (!("orderNumber" in resultSend)) return;
                        toast.success(`Draft ${resultSend.orderNumber} created`, {
                          description: `${resultSend.lineCount} SKUs · ${resultSend.drop1Qty} units`,
                        });
                        router.refresh();
                      });
                    }}
                  >
                    Send
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>
      </div>

      {!snapshot.releasedRun ? (
        <p className="text-sm text-muted-foreground">
          No released plan for {snapshot.periodLabel}. You can still adjust the live grid; Send
          stays disabled until Demand Planning is released.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Supplementary send against {snapshot.releasedRun.documentNumber}. Display units and
          forecast edits stay on this screen until you send.
        </p>
      )}

      <div className="responsive-card-grid">
        <KpiCard label="Quota" value={formatDemandPeso(result.quotaPeso)} />
        <KpiCard label="Drop 1 units" value={String(result.totals.drop1Qty)} />
        <KpiCard label="Drop 1 ₱" value={formatDemandPeso(result.totals.drop1Peso)} />
        <KpiCard label="Selected SKUs" value={String(selectedCount)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]">
        <WorkbenchParameterRail
          branchLabel={`${snapshot.sapCode} ${snapshot.name}`}
          periods={periods}
          periodId={snapshot.periodId}
          periodLabel={snapshot.periodLabel}
          dropsPerMonth={dropsPerMonth}
          scheduleDropsPerMonth={snapshot.scheduleDropsPerMonth}
          quotaMode={quotaMode}
          quotaPeso={quotaPeso}
          readOnly={readOnly}
          onPeriodChange={(periodId) => {
            router.push(`/planning/replenishment/${snapshot.branchId}?period=${periodId}`);
          }}
          onDropsPerMonth={setDropsPerMonth}
          onQuotaMode={setQuotaMode}
          onQuotaPeso={setQuotaPeso}
        />
        <DemandPlanningGrid
          variant="workbench"
          lines={lines}
          totals={totals}
          readOnly={readOnly}
          selectable={canManage}
          selectedLineIds={effectiveSelectedIds}
          onSelectedLineIdsChange={setSelectedLineIds}
          onSaveOverride={
            readOnly
              ? undefined
              : async (input) => {
                  setFacts((current) =>
                    applyWorkbenchFactOverride(current, input.lineId, input.field, input.value),
                  );
                  return {};
                }
          }
        />
      </div>
    </div>
  );
}
