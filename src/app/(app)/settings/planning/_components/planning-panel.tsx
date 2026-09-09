"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";

import {
  runAllocationAction,
  submitSuggestedOrdersAction,
} from "@/features/forecast/actions/forecast.actions";
import { AllocationGapsTable } from "@/features/forecast/components/allocation-gaps-table";
import {
  AllocationCompleteDialog,
  type AllocationCompleteResult,
} from "@/app/(app)/settings/planning/_components/allocation-complete-dialog";
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
  gapCount: number;
  allocationRowCount: number;
  draftOrders: number;
  targetBranchCount: number;
  tenantBranchCount: number;
  kpiHrefs: {
    totalBranches: string;
    gaps: string;
    drafts: string;
  };
  targets: PlanningTargetRow[];
  gapsResult: {
    items: {
      id: string;
      gapQty: number;
      planogramMax: number;
      currentStock: number;
      branch: { name: string };
      model: { skuCode: string; name: string };
    }[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  branches: PlanningBranchOption[];
  currentBranch?: string;
  currentQ?: string;
  initialSort?: string;
  initialSortDir?: string;
  gapsPreserveParams?: Record<string, string>;
  periodPreserveParams?: Record<string, string>;
}

export function PlanningPanel({
  period,
  periods,
  gapCount,
  allocationRowCount,
  draftOrders,
  targetBranchCount,
  tenantBranchCount,
  kpiHrefs,
  targets,
  gapsResult,
  branches,
  currentBranch,
  currentQ,
  initialSort,
  initialSortDir,
  gapsPreserveParams,
  periodPreserveParams,
}: PlanningPanelProps) {
  const router = useRouter();
  const [importing, setImporting] = useState(false);
  const [allocationResult, setAllocationResult] =
    useState<AllocationCompleteResult | null>(null);
  const [pending, startTransition] = useTransition();

  function runAction(
    label: string,
    fn: () => Promise<{ error?: string; success?: boolean }>,
  ) {
    startTransition(async () => {
      const result = await fn();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(label);
      router.refresh();
    });
  }

  function handleRunAllocation() {
    if (!period) return;
    startTransition(async () => {
      const result = await runAllocationAction(period.id);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setAllocationResult({
        gapCount: result.gapCount,
        totalGapUnits: result.totalGapUnits,
      });
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <PlanningKpiStrip
        periods={periods}
        selectedPeriodId={period?.id ?? ""}
        periodLabel={period?.label ?? null}
        isActivePeriod={period?.isActive ?? false}
        targetBranchCount={targetBranchCount}
        tenantBranchCount={tenantBranchCount}
        gapCount={gapCount}
        allocationRowCount={allocationRowCount}
        draftOrders={draftOrders}
        totalBranchesHref={kpiHrefs.totalBranches}
        gapsHref={kpiHrefs.gaps}
        draftsHref={kpiHrefs.drafts}
        periodPreserveParams={periodPreserveParams}
      />

      <div className="flex flex-wrap gap-1 rounded-xl border bg-card p-1.5 shadow-sm">
        <Button
          size="sm"
          variant="outline"
          className="rounded-lg"
          disabled={pending}
          onClick={() => setImporting(true)}
        >
          <Upload className="mr-1 size-4" />
          Import forecast
        </Button>

        {period ? (
          <>
            <Button
              size="sm"
              className="rounded-lg"
              disabled={pending}
              onClick={handleRunAllocation}
            >
              Run allocation
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-lg"
              disabled={pending || draftOrders === 0}
              onClick={() =>
                runAction("Submitted for TL review", () => submitSuggestedOrdersAction())
              }
            >
              Submit drafts for TL review
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" className="rounded-lg" asChild>
            <Link href="/planning/suggested-orders">View suggested orders</Link>
          </Button>
        )}
      </div>

      {period ? (
        <>
          <BranchRevenueTargetsTable
            periodId={period.id}
            targets={targets}
            branches={branches}
          />
          <div id="allocation-gaps" className="scroll-mt-24">
            <AllocationGapsTable
              basePath="/settings/planning"
              result={gapsResult}
              branches={branches}
              currentBranch={currentBranch}
              currentQ={currentQ}
              initialSort={initialSort}
              initialSortDir={initialSortDir}
              preserveParams={gapsPreserveParams}
            />
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          No planning period yet. Import forecast to set the period and each
          branch&apos;s revenue target, or add a target after a period exists.
        </p>
      )}

      <ImportForecastDialog open={importing} onOpenChange={setImporting} />
      {period ? (
        <AllocationCompleteDialog
          open={allocationResult !== null}
          onOpenChange={(open) => {
            if (!open) setAllocationResult(null);
          }}
          periodId={period.id}
          result={allocationResult}
        />
      ) : null}
    </div>
  );
}
