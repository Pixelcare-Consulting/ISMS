"use client";

import { KpiCard } from "@/lib/kpi-cards";
import { PlanningPeriodSelect, type PlanningPeriodOption } from "@/app/(app)/settings/planning/_components/planning-period-select";

interface PlanningKpiStripProps {
  periods: PlanningPeriodOption[];
  selectedPeriodId: string;
  periodLabel: string | null;
  isActivePeriod: boolean;
  targetBranchCount: number;
  tenantBranchCount: number;
}

export function PlanningKpiStrip({
  periods,
  selectedPeriodId,
  periodLabel,
  isActivePeriod,
  targetBranchCount,
  tenantBranchCount,
}: PlanningKpiStripProps) {
  return (
    <div className="responsive-card-grid">
      <div className="flex h-full flex-col rounded-xl border bg-card p-4 shadow-sm">
        <p className="min-w-0 text-sm leading-snug text-muted-foreground">Active period</p>
        <div className="mt-2">
          <PlanningPeriodSelect
            periods={periods}
            selectedPeriodId={selectedPeriodId}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {periodLabel
            ? isActivePeriod
              ? "Used on the dashboard"
              : "Switching activates this period"
            : "Import forecast to create a period"}
        </p>
      </div>
      <KpiCard
        label="Total branches"
        value={String(targetBranchCount)}
        hint={`of ${tenantBranchCount} branches`}
        href="#branch-targets"
        className="h-full"
      />
      <KpiCard
        label="Demand Planning"
        value="Open"
        hint="Runs, Drop 1, release"
        href="/settings/planning/runs"
        className="h-full"
      />
    </div>
  );
}
