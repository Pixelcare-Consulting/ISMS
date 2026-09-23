import { computeDemandPlan } from "@/features/demand-planning/engine/demand-planning.engine";
import { DEFAULT_DEMAND_PLAN_PARAMETERS } from "@/features/demand-planning/engine/demand-planning.constants";
import type {
  DemandPlanParameters,
  DemandPlanQuotaMode,
  DemandPlanResult,
  DemandPlanSkuInput,
} from "@/features/demand-planning/engine/demand-planning.types";
import { sumGridLineTotals } from "@/features/demand-planning/lib/client-mappers";
import type { DemandPlanningGridLine } from "@/features/demand-planning/types/run.types";
import type { WorkbenchSkuFact } from "@/features/demand-planning/types/workbench.types";

export function skuInputFromWorkbenchFact(fact: WorkbenchSkuFact): DemandPlanSkuInput {
  return {
    sku: fact.skuCode,
    series: fact.seriesCode,
    srp: fact.srp,
    planogramFlag: fact.planogramFlag,
    historyQty: fact.historyQty,
    historyPeso: fact.historyPeso,
    displayUnits: fact.displayUnits,
    onHandQty: fact.onHandQty,
    forecastQty: fact.forecastQty,
  };
}

export function applyWorkbenchFactOverride(
  facts: WorkbenchSkuFact[],
  lineId: string,
  field: "displayUnits" | "forecastQty",
  value: number,
): WorkbenchSkuFact[] {
  const next = Math.max(0, Math.trunc(value));
  return facts.map((fact) => {
    if (fact.modelId !== lineId) return fact;
    return { ...fact, [field]: next };
  });
}

export function resetWorkbenchFacts(facts: WorkbenchSkuFact[]): WorkbenchSkuFact[] {
  return facts.map((fact) => ({
    ...fact,
    displayUnits: fact.computedDisplayUnits,
    forecastQty: fact.computedForecastQty,
  }));
}

export function workbenchEngineParameters(input: {
  monthBasisDays?: number;
  dropsPerMonth: number;
  roundUpToOne?: boolean;
  floorAllocationAtZero?: boolean;
  quotaMode: DemandPlanQuotaMode;
  quotaPeso?: number;
}): DemandPlanParameters {
  return {
    monthBasisDays: input.monthBasisDays || DEFAULT_DEMAND_PLAN_PARAMETERS.monthBasisDays,
    dropsPerMonth:
      Number.isFinite(input.dropsPerMonth) && input.dropsPerMonth > 0
        ? input.dropsPerMonth
        : DEFAULT_DEMAND_PLAN_PARAMETERS.dropsPerMonth,
    roundUpToOne: input.roundUpToOne ?? DEFAULT_DEMAND_PLAN_PARAMETERS.roundUpToOne,
    floorAllocationAtZero:
      input.floorAllocationAtZero ?? DEFAULT_DEMAND_PLAN_PARAMETERS.floorAllocationAtZero,
    quotaMode: input.quotaMode,
    quotaPeso: input.quotaMode === "branch_target" ? input.quotaPeso ?? 0 : undefined,
  };
}

export function gridLinesFromDemandPlan(
  facts: WorkbenchSkuFact[],
  result: DemandPlanResult,
): DemandPlanningGridLine[] {
  const factBySku = new Map(facts.map((fact) => [fact.skuCode, fact]));
  return result.lines.flatMap((line) => {
    const fact = factBySku.get(line.sku);
    if (!fact) return [];
    return [
      {
        id: fact.modelId,
        runBranchId: "",
        modelId: fact.modelId,
        skuCode: line.sku,
        seriesCode: line.series,
        srp: line.srp,
        planogramFlag: line.planogramFlag,
        historyQty: line.historyQty,
        historyPeso: line.historyPeso,
        hmix: line.hmix,
        adjHmix: line.adjHmix,
        milQty: line.milQty,
        milPeso: line.milPeso,
        computedDisplayUnits: fact.computedDisplayUnits,
        displayUnits: line.displayUnits,
        onHandQty: line.onHandQty,
        computedForecastQty: fact.computedForecastQty,
        forecastQty: line.forecastQty,
        forecastPeso: line.forecastPeso,
        allocQty: line.allocQty,
        allocPeso: line.allocPeso,
        cycleQty: line.cycleQty,
        computedDrop1Qty: line.drop1Qty,
        releasedDrop1Qty: null,
        drop1Peso: line.drop1Peso,
        totalInventoryQty: line.totalInventoryQty,
        totalInventoryPeso: line.totalInventoryPeso,
      },
    ];
  });
}

export function computeWorkbenchGrid(input: {
  facts: WorkbenchSkuFact[];
  dropsPerMonth: number;
  quotaMode: DemandPlanQuotaMode;
  quotaPeso?: number;
  monthBasisDays?: number;
  roundUpToOne?: boolean;
  floorAllocationAtZero?: boolean;
}): { result: DemandPlanResult; lines: DemandPlanningGridLine[] } {
  const result = computeDemandPlan({
    parameters: workbenchEngineParameters(input),
    skus: input.facts.map(skuInputFromWorkbenchFact),
  });
  return { result, lines: gridLinesFromDemandPlan(input.facts, result) };
}

export function safeComputeWorkbenchGrid(
  input: Parameters<typeof computeWorkbenchGrid>[0],
): { result: DemandPlanResult; lines: DemandPlanningGridLine[] } {
  try {
    return computeWorkbenchGrid(input);
  } catch {
    return { result: emptyDemandPlanResult(input.dropsPerMonth, input.monthBasisDays), lines: [] };
  }
}

function emptyDemandPlanResult(dropsPerMonth: number, monthBasisDays?: number): DemandPlanResult {
  return {
    quotaPeso: 0,
    minLevelDays: 0,
    minLevelPeso: 0,
    dropsPerMonth,
    monthBasisDays: monthBasisDays || DEFAULT_DEMAND_PLAN_PARAMETERS.monthBasisDays,
    planStatus: "no_history",
    lines: [],
    totals: {
      historyQty: 0,
      historyPeso: 0,
      milQty: 0,
      milPeso: 0,
      displayUnits: 0,
      onHandQty: 0,
      onHandPeso: 0,
      forecastQty: 0,
      forecastPeso: 0,
      allocQty: 0,
      allocPeso: 0,
      cycleQty: 0,
      drop1Qty: 0,
      drop1Peso: 0,
      totalInventoryQty: 0,
      totalInventoryPeso: 0,
      planogramSkuCount: 0,
    },
    coverage: {
      historyDays: 0,
      milDays: 0,
      displayUnitsDays: 0,
      onHandDays: 0,
      forecastDays: 0,
      allocationDays: 0,
      drop1Days: 0,
      totalInventoryDays: 0,
      targetDays: 0,
    },
    mixBySeries: [],
  };
}

export function drop1SelectedIds(lines: DemandPlanningGridLine[]): string[] {
  return lines.filter((line) => (line.releasedDrop1Qty ?? line.computedDrop1Qty) > 0).map((line) => line.id);
}

export { sumGridLineTotals };
