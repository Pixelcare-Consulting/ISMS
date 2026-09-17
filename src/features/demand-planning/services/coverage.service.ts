import type { DemandPlanningPlanStatus, DemandPlanningRunStatus } from "@prisma/client";

import {
  computeDemandPlan,
  DEFAULT_DEMAND_PLAN_PARAMETERS,
  effectiveSrp,
  MONTH_BASIS_DAYS,
  type DemandPlanCoverage,
  type DemandPlanQuotaMode,
  type DemandPlanResult,
  type DemandPlanSeriesMix,
  type DemandPlanSkuInput,
  type DemandPlanningRunParameters,
  type PlanogramFlag,
} from "@/features/demand-planning";
import { coverageRepository } from "@/features/demand-planning/repositories/coverage.repository";
import { decimalToNumber } from "@/lib/database/decimal";

export const DEMAND_PLANNING_COVERAGE_PERMISSIONS = [
  "forecast.view",
  "forecast.manage",
  "reports.view",
] as const;

export type CoveragePeriodOption = {
  id: string;
  label: string;
  isActive: boolean;
};

export type CoverageRunSummary = {
  id: string;
  documentNumber: string;
  version: number;
  status: Extract<DemandPlanningRunStatus, "generated" | "released">;
  onHandAsAt: string | null;
};

export type CoverageMonitorKpis = {
  branchesPlanned: number;
  branchesInRun: number;
  networkTargetPeso: number;
  plannedAllocPeso: number;
  plannedAllocQty: number;
  allocationDays: number;
  milDays: number;
  targetDays: number;
  totalInventoryPeso: number;
};

export type CoverageDiiStage = {
  key: keyof Omit<DemandPlanCoverage, "targetDays">;
  label: string;
  days: number;
};

export type CoverageBranchRow = {
  branchId: string;
  sapCode: string;
  name: string;
  planStatus: DemandPlanningPlanStatus;
  quotaPeso: number;
  historyPeso: number;
  milQty: number;
  milPeso: number;
  milDays: number;
  allocQty: number;
  allocPeso: number;
  allocationDays: number;
  targetDays: number;
  drop1Qty: number;
  drop1Peso: number;
  totalInventoryPeso: number;
};

export type CoverageMonitorView = {
  periods: CoveragePeriodOption[];
  selectedPeriodId: string | null;
  periodLabel: string | null;
  isActivePeriod: boolean;
  run: CoverageRunSummary | null;
  kpis: CoverageMonitorKpis | null;
  coverage: DemandPlanCoverage | null;
  diiStages: CoverageDiiStage[];
  mixBySeries: DemandPlanSeriesMix[];
  branches: CoverageBranchRow[];
};

type CoverageRun = NonNullable<
  Awaited<ReturnType<typeof coverageRepository.findLatestCoverageRun>>
>;
type CoverageRunBranch = CoverageRun["branches"][number];

const DII_STAGES: CoverageDiiStage[] = [
  { key: "historyDays", label: "History", days: 0 },
  { key: "milDays", label: "MIL", days: 0 },
  { key: "displayUnitsDays", label: "Display units", days: 0 },
  { key: "onHandDays", label: "On hand", days: 0 },
  { key: "forecastDays", label: "Forecast", days: 0 },
  { key: "allocationDays", label: "Allocation", days: 0 },
  { key: "drop1Days", label: "Drop 1", days: 0 },
  { key: "totalInventoryDays", label: "Total inventory", days: 0 },
];

function emptyView(periods: CoveragePeriodOption[], selected?: CoveragePeriodOption): CoverageMonitorView {
  return {
    periods,
    selectedPeriodId: selected?.id ?? null,
    periodLabel: selected?.label ?? null,
    isActivePeriod: selected?.isActive ?? false,
    run: null,
    kpis: null,
    coverage: null,
    diiStages: [],
    mixBySeries: [],
    branches: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseQuotaMode(value: unknown): DemandPlanQuotaMode {
  if (value === "branch_target" || value === "derive_from_forecast") return value;
  return DEFAULT_DEMAND_PLAN_PARAMETERS.quotaMode;
}

function parseRunParameters(value: unknown): DemandPlanningRunParameters {
  const raw = isRecord(value) ? value : {};
  const monthBasisDays =
    typeof raw.monthBasisDays === "number" && raw.monthBasisDays > 0
      ? raw.monthBasisDays
      : MONTH_BASIS_DAYS;
  return {
    monthBasisDays,
    roundUpToOne:
      typeof raw.roundUpToOne === "boolean"
        ? raw.roundUpToOne
        : DEFAULT_DEMAND_PLAN_PARAMETERS.roundUpToOne,
    floorAllocationAtZero:
      typeof raw.floorAllocationAtZero === "boolean"
        ? raw.floorAllocationAtZero
        : DEFAULT_DEMAND_PLAN_PARAMETERS.floorAllocationAtZero,
    quotaMode: parseQuotaMode(raw.quotaMode),
    frequencyOverride:
      typeof raw.frequencyOverride === "number" && raw.frequencyOverride > 0
        ? raw.frequencyOverride
        : null,
  };
}

function asPlanogramFlag(value: string): PlanogramFlag {
  if (value === "Y" || value === "blank" || value === "free") return value;
  return "blank";
}

function toIso(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString();
}

function asCoverageRunStatus(
  status: DemandPlanningRunStatus,
): Extract<DemandPlanningRunStatus, "generated" | "released"> {
  switch (status) {
    case "generated":
    case "released":
      return status;
    case "draft":
    case "superseded":
      return "generated";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function diiDays(stagePeso: number, quotaPeso: number, monthBasisDays: number): number {
  if (quotaPeso <= 0) return 0;
  return (stagePeso / quotaPeso) * monthBasisDays;
}

function displayUnitsPeso(result: DemandPlanResult): number {
  return result.lines.reduce(
    (sum, line) => sum + line.displayUnits * effectiveSrp(line),
    0,
  );
}

function skuInputsFromLines(branch: CoverageRunBranch): DemandPlanSkuInput[] {
  return branch.lines.map((line) => ({
    sku: line.skuCode,
    series: line.seriesCode,
    srp: decimalToNumber(line.srp),
    planogramFlag: asPlanogramFlag(line.planogramFlag),
    historyQty: decimalToNumber(line.historyQty),
    historyPeso: decimalToNumber(line.historyPeso),
    displayUnits: line.displayUnits,
    onHandQty: line.onHandQty,
    forecastQty: line.forecastQty,
  }));
}

function computeBranchPlan(
  branch: CoverageRunBranch,
  parameters: DemandPlanningRunParameters,
): DemandPlanResult | null {
  if (branch.lines.length === 0) return null;

  const dropsStored = decimalToNumber(branch.dropsPerMonth);
  const dropsPerMonth =
    parameters.frequencyOverride && parameters.frequencyOverride > 0
      ? parameters.frequencyOverride
      : dropsStored > 0
        ? dropsStored
        : DEFAULT_DEMAND_PLAN_PARAMETERS.dropsPerMonth;

  try {
    return computeDemandPlan({
      parameters: {
        monthBasisDays: parameters.monthBasisDays,
        dropsPerMonth,
        roundUpToOne: parameters.roundUpToOne,
        floorAllocationAtZero: parameters.floorAllocationAtZero,
        // Frozen run quota — do not re-derive from current forecast lines.
        quotaMode: "branch_target",
        quotaPeso: Math.max(0, decimalToNumber(branch.quotaPeso)),
      },
      skus: skuInputsFromLines(branch),
    });
  } catch {
    return null;
  }
}

function emptyBranchRow(branch: CoverageRunBranch): CoverageBranchRow {
  return {
    branchId: branch.branch.id,
    sapCode: branch.branch.sapCode,
    name: branch.branch.name,
    planStatus: branch.planStatus,
    quotaPeso: decimalToNumber(branch.quotaPeso),
    historyPeso: decimalToNumber(branch.historyPeso),
    milQty: branch.milQty,
    milPeso: decimalToNumber(branch.milPeso),
    milDays: 0,
    allocQty: branch.allocQty,
    allocPeso: decimalToNumber(branch.allocPeso),
    allocationDays: 0,
    targetDays: decimalToNumber(branch.minLevelDays),
    drop1Qty: branch.drop1Qty,
    drop1Peso: decimalToNumber(branch.drop1Peso),
    totalInventoryPeso: 0,
  };
}

function rowFromResult(branch: CoverageRunBranch, result: DemandPlanResult): CoverageBranchRow {
  return {
    branchId: branch.branch.id,
    sapCode: branch.branch.sapCode,
    name: branch.branch.name,
    planStatus: result.planStatus === "no_history" ? "no_history" : "planned",
    quotaPeso: result.quotaPeso,
    historyPeso: result.totals.historyPeso,
    milQty: result.totals.milQty,
    milPeso: result.totals.milPeso,
    milDays: result.coverage.milDays,
    allocQty: result.totals.allocQty,
    allocPeso: result.totals.allocPeso,
    allocationDays: result.coverage.allocationDays,
    targetDays: result.coverage.targetDays,
    drop1Qty: result.totals.drop1Qty,
    drop1Peso: result.totals.drop1Peso,
    totalInventoryPeso: result.totals.totalInventoryPeso,
  };
}

function stagesFromCoverage(coverage: DemandPlanCoverage): CoverageDiiStage[] {
  return DII_STAGES.map((stage) => ({
    ...stage,
    days: coverage[stage.key],
  }));
}

function aggregateNetwork(
  results: DemandPlanResult[],
  fallbackTargetDays: number,
  monthBasisDays: number,
): { coverage: DemandPlanCoverage; kpis: Omit<CoverageMonitorKpis, "branchesPlanned" | "branchesInRun"> } {
  let quotaPeso = 0;
  let historyPeso = 0;
  let milPeso = 0;
  let displayPeso = 0;
  let onHandPeso = 0;
  let forecastPeso = 0;
  let allocPeso = 0;
  let allocQty = 0;
  let drop1Peso = 0;
  let totalInventoryPeso = 0;
  let targetWeighted = 0;

  for (const result of results) {
    quotaPeso += result.quotaPeso;
    historyPeso += result.totals.historyPeso;
    milPeso += result.totals.milPeso;
    displayPeso += displayUnitsPeso(result);
    onHandPeso += result.totals.onHandPeso;
    forecastPeso += result.totals.forecastPeso;
    allocPeso += result.totals.allocPeso;
    allocQty += result.totals.allocQty;
    drop1Peso += result.totals.drop1Peso;
    totalInventoryPeso += result.totals.totalInventoryPeso;
    targetWeighted += result.quotaPeso * result.coverage.targetDays;
  }

  const targetDays = quotaPeso > 0 ? targetWeighted / quotaPeso : fallbackTargetDays;
  const coverage: DemandPlanCoverage = {
    historyDays: diiDays(historyPeso, quotaPeso, monthBasisDays),
    milDays: diiDays(milPeso, quotaPeso, monthBasisDays),
    displayUnitsDays: diiDays(displayPeso, quotaPeso, monthBasisDays),
    onHandDays: diiDays(onHandPeso, quotaPeso, monthBasisDays),
    forecastDays: diiDays(forecastPeso, quotaPeso, monthBasisDays),
    allocationDays: diiDays(allocPeso, quotaPeso, monthBasisDays),
    drop1Days: diiDays(drop1Peso, quotaPeso, monthBasisDays),
    totalInventoryDays: diiDays(totalInventoryPeso, quotaPeso, monthBasisDays),
    targetDays,
  };

  return {
    coverage,
    kpis: {
      networkTargetPeso: quotaPeso,
      plannedAllocPeso: allocPeso,
      plannedAllocQty: allocQty,
      allocationDays: coverage.allocationDays,
      milDays: coverage.milDays,
      targetDays,
      totalInventoryPeso,
    },
  };
}

function aggregateMix(results: DemandPlanResult[]): DemandPlanSeriesMix[] {
  const buckets = new Map<string, { history: number; mil: number }>();
  let historyTotal = 0;
  let milTotal = 0;

  for (const result of results) {
    for (const line of result.lines) {
      const bucket = buckets.get(line.series) ?? { history: 0, mil: 0 };
      bucket.history += line.mixPeso;
      bucket.mil += line.milPeso;
      buckets.set(line.series, bucket);
      historyTotal += line.mixPeso;
      milTotal += line.milPeso;
    }
  }

  return [...buckets.entries()]
    .map(([series, bucket]) => ({
      series,
      historyShare: historyTotal > 0 ? bucket.history / historyTotal : 0,
      milShare: milTotal > 0 ? bucket.mil / milTotal : 0,
    }))
    .sort((a, b) => b.historyShare - a.historyShare);
}

function buildRunView(run: CoverageRun): Omit<
  CoverageMonitorView,
  "periods" | "selectedPeriodId" | "periodLabel" | "isActivePeriod"
> {
  const parameters = parseRunParameters(run.parameters);
  const branches: CoverageBranchRow[] = [];
  const plannedResults: DemandPlanResult[] = [];

  for (const branch of run.branches) {
    const result = computeBranchPlan(branch, parameters);
    if (result) {
      const row = rowFromResult(branch, result);
      branches.push(row);
      if (row.planStatus === "planned") plannedResults.push(result);
    } else {
      branches.push(emptyBranchRow(branch));
    }
  }

  const fallbackTarget =
    branches.find((row) => row.targetDays > 0)?.targetDays ??
    parameters.monthBasisDays / DEFAULT_DEMAND_PLAN_PARAMETERS.dropsPerMonth;
  const monthBasisDays =
    plannedResults[0]?.monthBasisDays ?? parameters.monthBasisDays;

  const network =
    plannedResults.length > 0
      ? aggregateNetwork(plannedResults, fallbackTarget, monthBasisDays)
      : {
          coverage: {
            historyDays: 0,
            milDays: 0,
            displayUnitsDays: 0,
            onHandDays: 0,
            forecastDays: 0,
            allocationDays: 0,
            drop1Days: 0,
            totalInventoryDays: 0,
            targetDays: fallbackTarget,
          } satisfies DemandPlanCoverage,
          kpis: {
            networkTargetPeso: branches.reduce((sum, row) => sum + row.quotaPeso, 0),
            plannedAllocPeso: 0,
            plannedAllocQty: 0,
            allocationDays: 0,
            milDays: 0,
            targetDays: fallbackTarget,
            totalInventoryPeso: 0,
          },
        };

  return {
    run: {
      id: run.id,
      documentNumber: run.documentNumber,
      version: run.version,
      status: asCoverageRunStatus(run.status),
      onHandAsAt: toIso(run.onHandAsAt),
    },
    kpis: {
      branchesPlanned: branches.filter((row) => row.planStatus === "planned").length,
      branchesInRun: branches.length,
      ...network.kpis,
    },
    coverage: network.coverage,
    diiStages: stagesFromCoverage(network.coverage),
    mixBySeries: aggregateMix(plannedResults),
    branches,
  };
}

export const coverageService = {
  async getCoverageMonitor(tenantId: string, periodId?: string): Promise<CoverageMonitorView> {
    const periods = await coverageRepository.listPeriods(tenantId);
    if (periods.length === 0) return emptyView([]);

    const requested = periodId?.trim()
      ? periods.find((period) => period.id === periodId.trim())
      : undefined;
    const selected = requested ?? periods.find((period) => period.isActive) ?? periods[0];
    if (!selected) return emptyView(periods);

    const run = await coverageRepository.findLatestCoverageRun(tenantId, selected.id);
    if (!run) return emptyView(periods, selected);

    return {
      periods,
      selectedPeriodId: selected.id,
      periodLabel: selected.label,
      isActivePeriod: selected.isActive,
      ...buildRunView(run),
    };
  },
};
