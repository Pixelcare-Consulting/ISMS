"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  DemandPlanningWizardShell,
  type DemandPlanningWizardStep,
} from "@/app/(app)/planning/_components/demand-planning-wizard-shell";
import { WizardStepParameters } from "@/app/(app)/planning/_components/wizard-step-parameters";
import { WizardStepReview } from "@/app/(app)/planning/_components/wizard-step-review";
import { WizardStepScope } from "@/app/(app)/planning/_components/wizard-step-scope";
import { WizardStepSources } from "@/app/(app)/planning/_components/wizard-step-sources";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_DEMAND_PLAN_PARAMETERS,
  MONTH_BASIS_DAYS,
  type DemandPlanQuotaMode,
} from "@/features/demand-planning";
import {
  generateDemandPlanRunAction,
  getDemandPlanningRunAction,
  previewDemandPlanSourcesAction,
} from "@/features/demand-planning/actions/demand-planning.actions";
import {
  threeMonthHistoryWindow,
  toDateInputValue,
} from "@/features/demand-planning/lib/history-window";
import { calendarMonthBoundsFromLabel } from "@/features/demand-planning/lib/planning-period-dates";
import type {
  DemandPlanningClientRun,
  DemandPlanningSourcePreview,
  DemandPlanningWizardBranch,
  DemandPlanningWizardDealer,
  DemandPlanningWizardPeriod,
} from "@/features/demand-planning/types/run.types";

const STEP_COPY: Record<DemandPlanningWizardStep, { title: string; description: string }> = {
  1: {
    title: "Scope",
    description: "Period, branches, and delivery frequency for this run.",
  },
  2: {
    title: "Parameters",
    description: "Quota, min level, and rounding before sources load.",
  },
  3: {
    title: "Confirm data sources",
    description:
      "Nothing is fetched until this is confirmed. Each row is stamped onto the generated document so a past plan can be explained.",
  },
  4: {
    title: "Review the recommendation",
    description:
      "The run is complete and stays Generated. Open the document to adjust lines, or close to return to the list.",
  },
};

function periodStartDate(period: DemandPlanningWizardPeriod | undefined): Date | null {
  if (!period) return null;
  if (period.startDate) {
    const parsed = new Date(period.startDate);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return calendarMonthBoundsFromLabel(period.label)?.startDate ?? null;
}

function defaultHistoryDates(period: DemandPlanningWizardPeriod | undefined): {
  historyFrom: string;
  historyTo: string;
} {
  const start = periodStartDate(period);
  if (!start) return { historyFrom: "", historyTo: "" };
  const window = threeMonthHistoryWindow(start);
  return {
    historyFrom: toDateInputValue(window.historyFrom),
    historyTo: toDateInputValue(window.historyTo),
  };
}

export function NewRunWizard({
  actorName,
  periods,
  dealers,
  branches,
  embedded = false,
  onClose,
  onOpenDocument,
}: {
  actorName: string;
  periods: DemandPlanningWizardPeriod[];
  dealers: DemandPlanningWizardDealer[];
  branches: DemandPlanningWizardBranch[];
  embedded?: boolean;
  onClose?: () => void;
  onOpenDocument?: (runId: string) => void;
}) {
  const initialPeriodId =
    periods.find((period) => period.isActive)?.id ?? periods[0]?.id ?? "";
  const initialHistory = defaultHistoryDates(
    periods.find((period) => period.id === initialPeriodId) ?? periods[0],
  );

  const [step, setStep] = useState<DemandPlanningWizardStep>(1);
  const [maxReached, setMaxReached] = useState<DemandPlanningWizardStep>(1);
  const [pending, startTransition] = useTransition();
  const [periodId, setPeriodId] = useState(initialPeriodId);
  const [name, setName] = useState("");
  const [dealerIds, setDealerIds] = useState<string[]>(() => dealers.map((dealer) => dealer.id));
  const [branchIds, setBranchIds] = useState<string[]>(() => branches.map((branch) => branch.id));
  const [historyFrom, setHistoryFrom] = useState(initialHistory.historyFrom);
  const [historyTo, setHistoryTo] = useState(initialHistory.historyTo);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [quotaMode, setQuotaMode] = useState<DemandPlanQuotaMode>(
    DEFAULT_DEMAND_PLAN_PARAMETERS.quotaMode,
  );
  const [frequencyOverride, setFrequencyOverride] = useState<number | null>(null);
  const [monthBasisDays, setMonthBasisDays] = useState(
    DEFAULT_DEMAND_PLAN_PARAMETERS.monthBasisDays || MONTH_BASIS_DAYS,
  );
  const [roundUpToOne, setRoundUpToOne] = useState(DEFAULT_DEMAND_PLAN_PARAMETERS.roundUpToOne);
  const [floorAllocationAtZero, setFloorAllocationAtZero] = useState(
    DEFAULT_DEMAND_PLAN_PARAMETERS.floorAllocationAtZero,
  );
  const [preview, setPreview] = useState<DemandPlanningSourcePreview | null>(null);
  const [run, setRun] = useState<DemandPlanningClientRun | null>(null);

  const historyDatesValid =
    Boolean(historyFrom) &&
    Boolean(historyTo) &&
    historyFrom < historyTo;

  const payload = useMemo(
    () => ({
      periodId,
      name: name.trim() || null,
      dealerIds,
      branchIds,
      monthBasisDays,
      roundUpToOne,
      floorAllocationAtZero,
      quotaMode,
      frequencyOverride,
      historyFrom: historyFrom || null,
      historyTo: historyTo || null,
    }),
    [
      periodId,
      name,
      dealerIds,
      branchIds,
      monthBasisDays,
      roundUpToOne,
      floorAllocationAtZero,
      quotaMode,
      frequencyOverride,
      historyFrom,
      historyTo,
    ],
  );

  const copy = STEP_COPY[step];
  const minLevelPeso =
    run && run.branches.length > 0
      ? run.branches.reduce((sum, branch) => sum + branch.minLevelPeso, 0)
      : null;
  const historyCaption = run
    ? `${run.branches.filter((branch) => branch.planStatus === "planned").length} with history · ${
        run.branches.filter((branch) => branch.planStatus !== "planned").length
      } awaiting first cycle`
    : undefined;

  function goTo(next: DemandPlanningWizardStep) {
    setStep(next);
    setMaxReached((current) => (next > current ? next : current));
  }

  function handlePeriodId(next: string) {
    setPeriodId(next);
    const period = periods.find((item) => item.id === next);
    const dates = defaultHistoryDates(period);
    setHistoryFrom(dates.historyFrom);
    setHistoryTo(dates.historyTo);
  }

  function canGoNext() {
    if (step === 1) {
      return Boolean(periodId) && branchIds.length > 0 && historyDatesValid;
    }
    if (step === 2) return Number.isFinite(monthBasisDays) && monthBasisDays > 0;
    if (step === 3) return Boolean(preview);
    return Boolean(run);
  }

  function loadPreview() {
    startTransition(async () => {
      const result = await previewDemandPlanSourcesAction(payload);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      if ("preview" in result && result.preview) setPreview(result.preview);
    });
  }

  function goNext() {
    if (step === 1 && !historyDatesValid) {
      toast.error("Date from must be before Date to");
      return;
    }
    if (step === 2) {
      goTo(3);
      loadPreview();
      return;
    }
    if (step === 3) {
      startTransition(async () => {
        const startedAt = performance.now();
        const result = await generateDemandPlanRunAction(payload);
        if ("error" in result && result.error) {
          toast.error(result.error);
          return;
        }
        if (!("runId" in result)) return;
        const loaded = await getDemandPlanningRunAction(result.runId);
        if ("error" in loaded && loaded.error) {
          toast.error(loaded.error);
          return;
        }
        if (!("run" in loaded) || !loaded.run) return;
        setRun(loaded.run);
        setElapsedMs(performance.now() - startedAt);
        goTo(4);
        toast.success("Plan generated", { description: result.documentNumber });
      });
      return;
    }
    if (step < 4) goTo((step + 1) as DemandPlanningWizardStep);
  }

  const stepMeta =
    step === 4 && elapsedMs != null
      ? `run completed in ${(elapsedMs / 1000).toFixed(1)} s`
      : undefined;

  return (
    <DemandPlanningWizardShell
      actorName={actorName}
      embedded={embedded}
      status={step === 4 ? "generated" : "draft"}
      onClose={onClose}
      step={step}
      maxReached={maxReached}
      title={copy.title}
      description={copy.description}
      stepMeta={stepMeta}
      onSelectStep={(next) => {
        if (step === 4) return;
        if (next <= maxReached) setStep(next);
      }}
      back={
        step === 4 ? null : (
          <Button
            type="button"
            variant="outline"
            disabled={step === 1}
            onClick={() => goTo((step - 1) as DemandPlanningWizardStep)}
          >
            Back
          </Button>
        )
      }
      next={
        step === 4 && run ? (
          <button
            type="button"
            className="cursor-pointer text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            onClick={() => onOpenDocument?.(run.id)}
          >
            Open document
          </button>
        ) : (
          <Button type="button" disabled={pending || !canGoNext()} onClick={goNext}>
            {step === 3 ? "Generate plan" : "Next"}
          </Button>
        )
      }
    >
      {step === 1 ? (
        <WizardStepScope
          periods={periods}
          dealers={dealers}
          branches={branches}
          periodId={periodId}
          name={name}
          dealerIds={dealerIds}
          branchIds={branchIds}
          frequencyOverride={frequencyOverride}
          historyFrom={historyFrom}
          historyTo={historyTo}
          branchCaption={historyCaption}
          onPeriodId={handlePeriodId}
          onName={setName}
          onDealerIds={setDealerIds}
          onBranchIds={setBranchIds}
          onFrequencyOverride={setFrequencyOverride}
          onHistoryFrom={setHistoryFrom}
          onHistoryTo={setHistoryTo}
        />
      ) : null}
      {step === 2 ? (
        <WizardStepParameters
          quotaMode={quotaMode}
          frequencyOverride={frequencyOverride}
          monthBasisDays={monthBasisDays}
          roundUpToOne={roundUpToOne}
          floorAllocationAtZero={floorAllocationAtZero}
          minLevelPeso={minLevelPeso}
          onQuotaMode={setQuotaMode}
          onMonthBasisDays={setMonthBasisDays}
          onRoundUpToOne={setRoundUpToOne}
          onFloorAllocationAtZero={setFloorAllocationAtZero}
        />
      ) : null}
      {step === 3 ? <WizardStepSources preview={preview} loading={pending && !preview} /> : null}
      {step === 4 && run ? <WizardStepReview run={run} /> : null}
    </DemandPlanningWizardShell>
  );
}
