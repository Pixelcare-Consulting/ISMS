"use client";

import { DataTableEmptyState } from "@/components/data-table";
import { CoverageKpiStrip } from "@/app/(app)/reports/demand-planning/_components/coverage-kpi-strip";
import { DiiByStageChart } from "@/app/(app)/reports/demand-planning/_components/dii-by-stage-chart";
import { MixRationalisationChart } from "@/app/(app)/reports/demand-planning/_components/mix-rationalisation-chart";
import { BranchRollupTable } from "@/app/(app)/reports/demand-planning/_components/branch-rollup-table";
import type { CoverageMonitorView } from "@/features/demand-planning/services/coverage.service";

interface CoverageMonitorPanelProps {
  view: CoverageMonitorView;
}

export function CoverageMonitorPanel({ view }: CoverageMonitorPanelProps) {
  if (view.periods.length === 0) {
    return (
      <DataTableEmptyState message="No planning period yet. Coverage appears after a demand plan is generated for a period." />
    );
  }

  const selectedPeriodId = view.selectedPeriodId ?? view.periods[0]!.id;

  return (
    <div className="space-y-6">
      <CoverageKpiStrip
        periods={view.periods}
        selectedPeriodId={selectedPeriodId}
        periodLabel={view.periodLabel}
        isActivePeriod={view.isActivePeriod}
        run={view.run}
        kpis={view.kpis}
      />

      {!view.run ? (
        <DataTableEmptyState message="No generated or released demand plan for this period yet. Coverage reads the latest generated or released run — it does not create one." />
      ) : (
        <>
          <div className="grid items-stretch gap-3 lg:grid-cols-2">
            <DiiByStageChart
              stages={view.diiStages}
              targetDays={view.coverage?.targetDays ?? 0}
            />
            <MixRationalisationChart mixBySeries={view.mixBySeries} />
          </div>
          <BranchRollupTable branches={view.branches} />
        </>
      )}
    </div>
  );
}
