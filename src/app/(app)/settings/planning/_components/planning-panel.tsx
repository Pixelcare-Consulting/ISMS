"use client";

import Link from "next/link";
import { useState } from "react";
import { Upload } from "lucide-react";

import { ImportForecastDialog } from "@/app/(app)/settings/planning/_components/import-forecast-dialog";
import {
  BranchRevenueTargetsTable,
  type PlanningBranchOption,
  type PlanningTargetRow,
} from "@/app/(app)/settings/planning/_components/branch-revenue-targets-table";
import { PlanningKpiStrip } from "@/app/(app)/settings/planning/_components/planning-kpi-strip";
import type { PlanningPeriodOption } from "@/app/(app)/settings/planning/_components/planning-period-select";
import { Button } from "@/components/ui/button";

interface PlanningPanelProps {
  period: {
    id: string;
    label: string;
    isActive: boolean;
  } | null;
  periods: PlanningPeriodOption[];
  targetBranchCount: number;
  tenantBranchCount: number;
  targets: PlanningTargetRow[];
  branches: PlanningBranchOption[];
}

export function PlanningPanel({
  period,
  periods,
  targetBranchCount,
  tenantBranchCount,
  targets,
  branches,
}: PlanningPanelProps) {
  const [importing, setImporting] = useState(false);

  return (
    <div className="space-y-6">
      <PlanningKpiStrip
        periods={periods}
        selectedPeriodId={period?.id ?? ""}
        periodLabel={period?.label ?? null}
        isActivePeriod={period?.isActive ?? false}
        targetBranchCount={targetBranchCount}
        tenantBranchCount={tenantBranchCount}
      />

      <div className="flex flex-wrap gap-1 rounded-xl border bg-card p-1.5 shadow-sm">
        <Button
          size="sm"
          variant="outline"
          className="rounded-lg"
          onClick={() => setImporting(true)}
        >
          <Upload className="mr-1 size-4" />
          Import forecast
        </Button>
        <Button size="sm" className="rounded-lg" asChild>
          <Link href="/settings/planning/runs">Open Demand Planning</Link>
        </Button>
      </div>

      {period ? (
        <BranchRevenueTargetsTable
          periodId={period.id}
          targets={targets}
          branches={branches}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          No planning period yet. Import forecast to set the period and each
          branch&apos;s revenue target (quota override), or add a target after a
          period exists.
        </p>
      )}

      <ImportForecastDialog open={importing} onOpenChange={setImporting} />
    </div>
  );
}
