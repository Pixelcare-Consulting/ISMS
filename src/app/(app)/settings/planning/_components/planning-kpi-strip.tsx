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
  gapCount: number;
  allocationRowCount: number;
  draftOrders: number;
  totalBranchesHref: string;
  gapsHref: string;
  draftsHref: string;
  periodPreserveParams?: Record<string, string>;
}

export function PlanningKpiStrip({
  periods,
  selectedPeriodId,
  periodLabel,
  isActivePeriod,
  targetBranchCount,
  tenantBranchCount,
  gapCount,
  allocationRowCount,
  draftOrders,
  totalBranchesHref,
  gapsHref,
  draftsHref,
  periodPreserveParams,
}: PlanningKpiStripProps) {
  return (
    <div className="responsive-card-grid">
      <div className="flex h-full flex-col rounded-xl border bg-card p-4 shadow-sm">
        <p className="min-w-0 text-sm leading-snug text-muted-foreground">Active period</p>
        <div className="mt-2">
          <PlanningPeriodSelect
            periods={periods}
            selectedPeriodId={selectedPeriodId}
            preserveParams={periodPreserveParams}
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
        href={totalBranchesHref}
        className="h-full"
      />
      <KpiCard
        label="Allocation gaps"
        value={String(gapCount)}
        href={gapsHref}
        className="h-full"
      />
      <KpiCard
        label="Allocation rows"
        value={String(allocationRowCount)}
        href={gapsHref}
        className="h-full"
      />
      <KpiCard
        label="Draft suggestions"
        value={String(draftOrders)}
        href={draftsHref}
        className="h-full"
      />
    </div>
  );
}
