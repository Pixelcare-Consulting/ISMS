"use client";

import { KpiCard, type KpiCardTone } from "@/lib/kpi-cards";
import { formatPeso } from "@/utils/format-currency";
import { CoveragePeriodSelect } from "@/app/(app)/reports/demand-planning/_components/coverage-period-select";
import type {
  CoverageMonitorKpis,
  CoveragePeriodOption,
  CoverageRunSummary,
} from "@/features/demand-planning/services/coverage.service";

interface CoverageKpiStripProps {
  periods: CoveragePeriodOption[];
  selectedPeriodId: string;
  periodLabel: string | null;
  isActivePeriod: boolean;
  run: CoverageRunSummary | null;
  kpis: CoverageMonitorKpis | null;
}

function formatDays(value: number): string {
  return `${value.toFixed(1)} d`;
}

function coverageTone(actualDays: number, targetDays: number): KpiCardTone {
  if (targetDays <= 0) return "neutral";
  if (actualDays + 0.05 < targetDays) return "warning";
  return "neutral";
}

function runHint(run: CoverageRunSummary | null, periodLabel: string | null, isActivePeriod: boolean): string {
  if (run) {
    const status = run.status === "released" ? "Released" : "Generated";
    return `${run.documentNumber} · v${run.version} · ${status}`;
  }
  if (periodLabel) {
    return isActivePeriod ? "Used on the dashboard" : "No generated plan for this period";
  }
  return "Import a forecast to create a period";
}

export function CoverageKpiStrip({
  periods,
  selectedPeriodId,
  periodLabel,
  isActivePeriod,
  run,
  kpis,
}: CoverageKpiStripProps) {
  return (
    <div className="responsive-card-grid">
      <div className="flex h-full flex-col rounded-xl border bg-card p-4 shadow-sm">
        <p className="min-w-0 text-sm leading-snug text-muted-foreground">Period</p>
        <div className="mt-2">
          <CoveragePeriodSelect periods={periods} selectedPeriodId={selectedPeriodId} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {runHint(run, periodLabel, isActivePeriod)}
        </p>
      </div>
      <KpiCard
        label="Branches planned"
        value={kpis ? String(kpis.branchesPlanned) : "—"}
        hint={kpis ? `of ${kpis.branchesInRun} in this run` : "Generate a demand plan to see coverage"}
        className="h-full"
      />
      <KpiCard
        label="Network target"
        value={kpis ? formatPeso(kpis.networkTargetPeso) : "—"}
        hint="Sum of branch quotas"
        className="h-full"
      />
      <KpiCard
        label="Planned allocation"
        value={kpis ? formatPeso(kpis.plannedAllocPeso) : "—"}
        hint={kpis ? `${kpis.plannedAllocQty.toLocaleString("en-PH")} units` : undefined}
        className="h-full"
      />
      <KpiCard
        label="Coverage at allocation"
        value={kpis ? `${formatDays(kpis.allocationDays)} vs ${formatDays(kpis.targetDays)}` : "—"}
        hint={kpis ? "Allocation days vs min-level target" : undefined}
        tone={kpis ? coverageTone(kpis.allocationDays, kpis.targetDays) : "neutral"}
        className="h-full"
      />
      <KpiCard
        label="MIL vs target"
        value={kpis ? `${formatDays(kpis.milDays)} vs ${formatDays(kpis.targetDays)}` : "—"}
        hint={kpis ? "Min inventory days vs min-level target" : undefined}
        tone={kpis ? coverageTone(kpis.milDays, kpis.targetDays) : "neutral"}
        className="h-full"
      />
      <KpiCard
        label="Total inventory"
        value={kpis ? formatPeso(kpis.totalInventoryPeso) : "—"}
        hint="MIL + display + on hand + forecast"
        className="h-full"
      />
    </div>
  );
}
