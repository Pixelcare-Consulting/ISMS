import { planogramFlagFor } from "@/features/demand-planning/lib/planogram-flag";
import type { DemandPlanSkuInput } from "@/features/demand-planning/engine/demand-planning.types";

import { averageOverHistoryMonths } from "./history-window";

export type BranchSkuModel = {
  modelId: string;
  skuCode: string;
  series: string;
  srp: number;
};

export type BranchSkuFact = BranchSkuModel & {
  hasPlanogram: boolean;
  historyQty: number;
  historyPeso: number;
  onHandQty: number;
  forecastQty: number;
  displayUnits: number;
};

export function collectUniverseModelIds(input: {
  planogramModelIds: Iterable<string>;
  allowedModelIds: Iterable<string>;
  historyModelIds: Iterable<string>;
  forecastModelIds: Iterable<string>;
}): string[] {
  const ids = new Set<string>();
  for (const id of input.planogramModelIds) ids.add(id);
  for (const id of input.allowedModelIds) ids.add(id);
  for (const id of input.historyModelIds) ids.add(id);
  for (const id of input.forecastModelIds) ids.add(id);
  return [...ids];
}

export function toDemandPlanSkuInput(fact: BranchSkuFact): DemandPlanSkuInput {
  return {
    sku: fact.skuCode,
    series: fact.series,
    srp: fact.srp,
    planogramFlag: planogramFlagFor({
      hasPlanogramRow: fact.hasPlanogram,
      srp: fact.srp,
    }),
    historyQty: fact.historyQty,
    historyPeso: fact.historyPeso,
    displayUnits: fact.displayUnits,
    onHandQty: fact.onHandQty,
    forecastQty: fact.forecastQty,
  };
}

export function buildBranchSkuFacts(input: {
  universeModelIds: string[];
  models: Map<string, BranchSkuModel>;
  planogramModelIds: Set<string>;
  historyTotals: Map<string, { qty: number; peso: number }>;
  onHandQty: Map<string, number>;
  forecastQty: Map<string, number>;
  displayUnits: Map<string, number>;
  /** Calendar months in the history window (defaults to 3). */
  historyMonths?: number;
}): BranchSkuFact[] {
  const months = input.historyMonths;
  const facts: BranchSkuFact[] = [];
  for (const modelId of input.universeModelIds) {
    const model = input.models.get(modelId);
    if (!model) continue;
    const history = input.historyTotals.get(modelId);
    facts.push({
      ...model,
      hasPlanogram: input.planogramModelIds.has(modelId),
      historyQty: averageOverHistoryMonths(history?.qty ?? 0, months),
      historyPeso: averageOverHistoryMonths(history?.peso ?? 0, months),
      onHandQty: input.onHandQty.get(modelId) ?? 0,
      forecastQty: input.forecastQty.get(modelId) ?? 0,
      displayUnits: input.displayUnits.get(modelId) ?? 0,
    });
  }
  return facts.sort((a, b) => a.skuCode.localeCompare(b.skuCode));
}

export function modelIdBySku(facts: BranchSkuFact[]): Map<string, string> {
  return new Map(facts.map((fact) => [fact.skuCode, fact.modelId]));
}
