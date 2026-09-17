import type { DemandPlanLine, DemandPlanResult } from "@/features/demand-planning/engine/demand-planning.types";
import type { DemandPlanSkuInput } from "@/features/demand-planning/engine/demand-planning.types";
import type { DemandPlanningPlanStatus } from "@prisma/client";

export type PersistableDemandLine = {
  modelId: string;
  skuCode: string;
  seriesCode: string;
  srp: number;
  planogramFlag: string;
  historyQty: number;
  historyPeso: number;
  hmix: number;
  adjHmix: number;
  milQty: number;
  milPeso: number;
  computedDisplayUnits: number;
  displayUnits: number;
  onHandQty: number;
  computedForecastQty: number;
  forecastQty: number;
  forecastPeso: number;
  allocQty: number;
  allocPeso: number;
  cycleQty: number;
  computedDrop1Qty: number;
  drop1Peso: number;
  totalInventoryQty: number;
  totalInventoryPeso: number;
};

export type PersistableRunBranch = {
  branchId: string;
  planStatus: DemandPlanningPlanStatus;
  quotaPeso: number;
  minLevelDays: number;
  minLevelPeso: number;
  dropsPerMonth: number;
  historyQty: number;
  historyPeso: number;
  milQty: number;
  milPeso: number;
  displayUnits: number;
  onHandQty: number;
  forecastQty: number;
  forecastPeso: number;
  allocQty: number;
  allocPeso: number;
  drop1Qty: number;
  drop1Peso: number;
  cycleQty: number;
  planogramSkuCount: number;
  coverageDays: number;
  lines: PersistableDemandLine[];
};

export function engineLineToPersist(input: {
  line: DemandPlanLine;
  modelId: string;
  computedDisplayUnits: number;
  computedForecastQty: number;
}): PersistableDemandLine {
  return {
    modelId: input.modelId,
    skuCode: input.line.sku,
    seriesCode: input.line.series,
    srp: input.line.srp,
    planogramFlag: input.line.planogramFlag,
    historyQty: input.line.historyQty,
    historyPeso: input.line.historyPeso,
    hmix: input.line.hmix,
    adjHmix: input.line.adjHmix,
    milQty: input.line.milQty,
    milPeso: input.line.milPeso,
    computedDisplayUnits: input.computedDisplayUnits,
    displayUnits: input.line.displayUnits,
    onHandQty: input.line.onHandQty,
    computedForecastQty: input.computedForecastQty,
    forecastQty: input.line.forecastQty,
    forecastPeso: input.line.forecastPeso,
    allocQty: input.line.allocQty,
    allocPeso: input.line.allocPeso,
    cycleQty: input.line.cycleQty,
    computedDrop1Qty: input.line.drop1Qty,
    drop1Peso: input.line.drop1Peso,
    totalInventoryQty: input.line.totalInventoryQty,
    totalInventoryPeso: input.line.totalInventoryPeso,
  };
}

export function persistableBranchFromResult(input: {
  branchId: string;
  result: DemandPlanResult;
  modelIdBySku: Map<string, string>;
  computedBySku: Map<string, { displayUnits: number; forecastQty: number }>;
}): PersistableRunBranch {
  const lines: PersistableDemandLine[] = [];
  for (const line of input.result.lines) {
    const modelId = input.modelIdBySku.get(line.sku);
    if (!modelId) continue;
    const computed = input.computedBySku.get(line.sku);
    lines.push(
      engineLineToPersist({
        line,
        modelId,
        computedDisplayUnits: computed?.displayUnits ?? line.displayUnits,
        computedForecastQty: computed?.forecastQty ?? line.forecastQty,
      }),
    );
  }

  return {
    branchId: input.branchId,
    planStatus: input.result.planStatus,
    quotaPeso: input.result.quotaPeso,
    minLevelDays: input.result.minLevelDays,
    minLevelPeso: input.result.minLevelPeso,
    dropsPerMonth: input.result.dropsPerMonth,
    historyQty: input.result.totals.historyQty,
    historyPeso: input.result.totals.historyPeso,
    milQty: input.result.totals.milQty,
    milPeso: input.result.totals.milPeso,
    displayUnits: input.result.totals.displayUnits,
    onHandQty: input.result.totals.onHandQty,
    forecastQty: input.result.totals.forecastQty,
    forecastPeso: input.result.totals.forecastPeso,
    allocQty: input.result.totals.allocQty,
    allocPeso: input.result.totals.allocPeso,
    drop1Qty: input.result.totals.drop1Qty,
    drop1Peso: input.result.totals.drop1Peso,
    cycleQty: input.result.totals.cycleQty,
    planogramSkuCount: input.result.totals.planogramSkuCount,
    coverageDays: input.result.coverage.totalInventoryDays,
    lines,
  };
}

export function skuInputFromPersistableLine(line: PersistableDemandLine): DemandPlanSkuInput {
  return {
    sku: line.skuCode,
    series: line.seriesCode,
    srp: Number(line.srp),
    planogramFlag: line.planogramFlag === "Y" || line.planogramFlag === "free" ? line.planogramFlag : "blank",
    historyQty: Number(line.historyQty),
    historyPeso: Number(line.historyPeso),
    displayUnits: line.displayUnits,
    onHandQty: line.onHandQty,
    forecastQty: line.forecastQty,
  };
}
