"use client";

import { DemandPlanningMetricStrip } from "@/app/(app)/planning/_components/demand-planning-metric-strip";
import { formatDemandPeso, formatDemandQty } from "@/features/demand-planning/lib/format-demand-plan";
import type { DemandPlanningClientRun } from "@/features/demand-planning/types/run.types";

function formatDaysLabel(value: number): string {
  if (!Number.isFinite(value)) return "0.0 d";
  return `${value.toFixed(1)} d`;
}

export function WizardStepReview({ run }: { run: DemandPlanningClientRun }) {
  const planogramSkus =
    run.stamps.planogramSkuCount ??
    run.branches.reduce((sum, branch) => sum + branch.totals.planogramSkuCount, 0);
  const demandLines = run.stamps.planogramYCount ?? planogramSkus;
  const allocQty = run.branches.reduce((sum, branch) => sum + branch.totals.allocQty, 0);
  const allocPeso = run.branches.reduce((sum, branch) => sum + branch.totals.allocPeso, 0);

  const planned = run.branches.filter(
    (branch) => branch.planStatus === "planned" && branch.coverageDays != null,
  );
  const coverageSource = planned.length > 0 ? planned : run.branches;
  const coverageDays =
    coverageSource.length > 0
      ? coverageSource.reduce((sum, branch) => sum + (branch.coverageDays ?? 0), 0) /
        coverageSource.length
      : null;
  const targetDays =
    coverageSource.length > 0
      ? coverageSource.reduce((sum, branch) => sum + branch.minLevelDays, 0) / coverageSource.length
      : null;

  return (
    <div className="space-y-4">
      <DemandPlanningMetricStrip
        size="hero"
        items={[
          {
            label: "Lines with demand",
            value: formatDemandQty(demandLines),
            hint: `of ${formatDemandQty(planogramSkus)} planogram SKUs`,
          },
          {
            label: "Month allocation",
            value: formatDemandQty(allocQty),
            hint: formatDemandPeso(allocPeso),
          },
          {
            label: "Drop 1 · suggested",
            value: formatDemandQty(run.drop1Qty),
            hint: formatDemandPeso(run.drop1Peso),
            emphasize: true,
          },
          {
            label: "Coverage after drop",
            value: coverageDays != null ? formatDaysLabel(coverageDays) : "—",
            hint: targetDays != null ? `target ${formatDaysLabel(targetDays)}/cycle` : undefined,
          },
        ]}
      />
      <p className="text-sm text-muted-foreground">
        This plan is Generated as {run.documentNumber} v{run.version}. Open the document if you
        need to review or adjust display units and forecast. Release to Ordering from the document
        when you are ready — that freezes the plan and sends Auto Replenish orders with Drop 1
        quantity straight to Team Leader.
      </p>
    </div>
  );
}
