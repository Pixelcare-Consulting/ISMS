import { computeDemandPlan } from "@/features/demand-planning/engine/demand-planning.engine";
import {
  DEFAULT_DEMAND_PLAN_PARAMETERS,
  dropsPerMonthForFrequency,
} from "@/features/demand-planning/engine/demand-planning.constants";
import type {
  DemandPlanParameters,
  DemandPlanQuotaMode,
  DemandPlanSkuInput,
} from "@/features/demand-planning/engine/demand-planning.types";
import {
  buildBranchSkuFacts,
  collectUniverseModelIds,
  modelIdBySku,
  toDemandPlanSkuInput,
  type BranchSkuFact,
} from "@/features/demand-planning/lib/sku-input-builder";
import { persistableBranchFromResult } from "@/features/demand-planning/lib/line-mapper";
import type { PersistableRunBranch } from "@/features/demand-planning/lib/line-mapper";
import { demandPlanningFactsRepository } from "@/features/demand-planning/repositories/demand-planning-facts.repository";
import { decimalToNumber } from "@/lib/database/decimal";

export type RunComputeParameters = {
  monthBasisDays: number;
  roundUpToOne: boolean;
  floorAllocationAtZero: boolean;
  quotaMode: DemandPlanQuotaMode;
  frequencyOverride: number | null;
};

export type LineOverrideMap = Map<string, { displayUnits: number; forecastQty: number }>;

export type AssembledBranch = {
  branchId: string;
  dropsPerMonth: number;
  quotaPeso?: number;
  facts: BranchSkuFact[];
  skus: DemandPlanSkuInput[];
  modelIdBySku: Map<string, string>;
  computedBySku: Map<string, { displayUnits: number; forecastQty: number }>;
};

export type RunSourceStamps = {
  historySkuCount: number;
  historyPeso: number;
  planogramYCount: number;
  planogramSkuCount: number;
  forecastUnitCount: number;
  forecastPeso: number;
  onHandUnitCount: number;
  onHandPeso: number;
  displayUnitsCount: number;
};

function emptyStamps(): RunSourceStamps {
  return {
    historySkuCount: 0,
    historyPeso: 0,
    planogramYCount: 0,
    planogramSkuCount: 0,
    forecastUnitCount: 0,
    forecastPeso: 0,
    onHandUnitCount: 0,
    onHandPeso: 0,
    displayUnitsCount: 0,
  };
}

function engineParametersForBranch(
  run: RunComputeParameters,
  dropsPerMonth: number,
  quotaPeso: number | undefined,
): DemandPlanParameters {
  return {
    monthBasisDays: run.monthBasisDays || DEFAULT_DEMAND_PLAN_PARAMETERS.monthBasisDays,
    dropsPerMonth,
    roundUpToOne: run.roundUpToOne,
    floorAllocationAtZero: run.floorAllocationAtZero,
    quotaMode: run.quotaMode,
    quotaPeso: run.quotaMode === "branch_target" ? quotaPeso ?? 0 : undefined,
  };
}

export const demandPlanningFactsService = {
  async assembleBranches(input: {
    tenantId: string;
    periodId: string;
    branchIds: string[];
    historyFrom: Date;
    historyTo: Date;
    parameters: RunComputeParameters;
    overridesByBranch?: Map<string, LineOverrideMap>;
  }): Promise<{ assembled: AssembledBranch[]; stamps: RunSourceStamps; onHandAsAt: Date }> {
    const onHandAsAt = new Date();
    const branchIds = [...new Set(input.branchIds)];
    const [branches, planogram, allowed, forecasts, targets, soldStatusIds, stk] =
      await Promise.all([
        demandPlanningFactsRepository.listActiveBranchesByIds(input.tenantId, branchIds),
        demandPlanningFactsRepository.listPlanogramModelIds(input.tenantId, branchIds),
        demandPlanningFactsRepository.listAllowedModelIds(input.tenantId, branchIds),
        demandPlanningFactsRepository.listSkuForecasts(input.tenantId, input.periodId, branchIds),
        demandPlanningFactsRepository.listBranchTargets(input.tenantId, input.periodId, branchIds),
        demandPlanningFactsRepository.listSoldStatusIds(input.tenantId),
        demandPlanningFactsRepository.findStkStatusId(input.tenantId),
      ]);

    const history = await demandPlanningFactsRepository.listHistoryTotals(
      input.tenantId,
      branchIds,
      soldStatusIds,
      input.historyFrom,
      input.historyTo,
    );

    const planogramByBranch = new Map<string, Set<string>>();
    const allowedByBranch = new Map<string, Set<string>>();
    const forecastByBranch = new Map<string, Map<string, number>>();
    const historyByBranch = new Map<string, Map<string, { qty: number; peso: number }>>();
    const targetByBranch = new Map<string, number>();

    for (const row of planogram) {
      const set = planogramByBranch.get(row.branchId) ?? new Set<string>();
      set.add(row.modelId);
      planogramByBranch.set(row.branchId, set);
    }
    for (const row of allowed) {
      const set = allowedByBranch.get(row.branchId) ?? new Set<string>();
      set.add(row.modelId);
      allowedByBranch.set(row.branchId, set);
    }
    for (const row of forecasts) {
      const map = forecastByBranch.get(row.branchId) ?? new Map<string, number>();
      map.set(row.modelId, row.qty);
      forecastByBranch.set(row.branchId, map);
    }
    for (const row of history) {
      const map = historyByBranch.get(row.branchId) ?? new Map();
      map.set(row.modelId, { qty: row.qty, peso: row.peso });
      historyByBranch.set(row.branchId, map);
    }
    for (const row of targets) {
      targetByBranch.set(row.branchId, decimalToNumber(row.revenueTarget));
    }

    const universeByBranch = new Map<string, string[]>();
    const allModelIds = new Set<string>();
    for (const branch of branches) {
      const ids = collectUniverseModelIds({
        planogramModelIds: planogramByBranch.get(branch.id) ?? [],
        allowedModelIds: allowedByBranch.get(branch.id) ?? [],
        historyModelIds: historyByBranch.get(branch.id)?.keys() ?? [],
        forecastModelIds: forecastByBranch.get(branch.id)?.keys() ?? [],
      });
      universeByBranch.set(branch.id, ids);
      for (const id of ids) allModelIds.add(id);
    }

    const [models, onHandRows] = await Promise.all([
      demandPlanningFactsRepository.listModelsWithPricing(input.tenantId, [...allModelIds]),
      demandPlanningFactsRepository.listStkOnHand(
        input.tenantId,
        branchIds,
        [...allModelIds],
        stk?.id ?? null,
      ),
    ]);

    const modelsById = new Map(models.map((model) => [model.modelId, model]));
    const onHandByBranch = new Map<string, Map<string, number>>();
    for (const row of onHandRows) {
      const map = onHandByBranch.get(row.branchId) ?? new Map<string, number>();
      map.set(row.modelId, row.qty);
      onHandByBranch.set(row.branchId, map);
    }

    const stamps = emptyStamps();
    const assembled: AssembledBranch[] = [];

    for (const branch of branches) {
      const planogramIds = planogramByBranch.get(branch.id) ?? new Set<string>();
      const facts = buildBranchSkuFacts({
        universeModelIds: universeByBranch.get(branch.id) ?? [],
        models: modelsById,
        planogramModelIds: planogramIds,
        historyTotals: historyByBranch.get(branch.id) ?? new Map(),
        onHandQty: onHandByBranch.get(branch.id) ?? new Map(),
        forecastQty: forecastByBranch.get(branch.id) ?? new Map(),
        displayUnits: new Map(),
      });

      const sfeBySku = new Map(facts.map((fact) => [fact.skuCode, fact.forecastQty]));
      const overrides = input.overridesByBranch?.get(branch.id);
      if (overrides) {
        for (const fact of facts) {
          const override = overrides.get(fact.modelId);
          if (!override) continue;
          fact.displayUnits = override.displayUnits;
          fact.forecastQty = override.forecastQty;
        }
      }

      const frequency = branch.deliveryScheduleConfig?.frequencyCode.frequency ?? "monthly";
      const dropsPerMonth =
        input.parameters.frequencyOverride ?? dropsPerMonthForFrequency(frequency);

      assembled.push({
        branchId: branch.id,
        dropsPerMonth,
        quotaPeso: targetByBranch.get(branch.id),
        facts,
        skus: facts.map(toDemandPlanSkuInput),
        modelIdBySku: modelIdBySku(facts),
        computedBySku: new Map(
          facts.map((fact) => [
            fact.skuCode,
            {
              displayUnits: 0,
              forecastQty: sfeBySku.get(fact.skuCode) ?? 0,
            },
          ]),
        ),
      });

      stamps.planogramYCount += planogramIds.size;
      stamps.planogramSkuCount += facts.filter((fact) => fact.hasPlanogram).length;
      for (const fact of facts) {
        if (fact.historyQty > 0) stamps.historySkuCount += 1;
        stamps.historyPeso += fact.historyPeso;
        stamps.forecastUnitCount += fact.forecastQty;
        stamps.forecastPeso += fact.forecastQty * fact.srp;
        stamps.onHandUnitCount += fact.onHandQty;
        stamps.onHandPeso += fact.onHandQty * fact.srp;
        stamps.displayUnitsCount += fact.displayUnits;
      }
    }

    stamps.historyPeso = Math.round(stamps.historyPeso * 100) / 100;
    stamps.forecastPeso = Math.round(stamps.forecastPeso * 100) / 100;
    stamps.onHandPeso = Math.round(stamps.onHandPeso * 100) / 100;

    return { assembled, stamps, onHandAsAt };
  },

  computePersistableBranches(
    assembled: AssembledBranch[],
    parameters: RunComputeParameters,
  ): PersistableRunBranch[] {
    return assembled.map((branch) => {
      const result = computeDemandPlan({
        parameters: engineParametersForBranch(
          parameters,
          branch.dropsPerMonth,
          branch.quotaPeso,
        ),
        skus: branch.skus,
      });
      return persistableBranchFromResult({
        branchId: branch.branchId,
        result,
        modelIdBySku: branch.modelIdBySku,
        computedBySku: branch.computedBySku,
      });
    });
  },
};
