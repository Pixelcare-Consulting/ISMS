import { MONTH_BASIS_DAYS } from "./demand-planning.constants";
import type {
  DemandPlanCoverage,
  DemandPlanInput,
  DemandPlanLine,
  DemandPlanParameters,
  DemandPlanResult,
  DemandPlanSeriesMix,
  DemandPlanSkuInput,
  DemandPlanTotals,
  PlanogramFlag,
} from "./demand-planning.types";

function roundQty(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function nonNegativeInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function isFreeFlag(flag: PlanogramFlag): boolean {
  return flag === "free";
}

function isPlanogramY(flag: PlanogramFlag): boolean {
  return flag === "Y";
}

/** Effective SRP for mix / MIL / pesos. Free and SRP≤0 never enter value mix. */
export function effectiveSrp(sku: Pick<DemandPlanSkuInput, "srp" | "planogramFlag">): number {
  if (isFreeFlag(sku.planogramFlag)) return 0;
  if (!Number.isFinite(sku.srp) || sku.srp <= 0) return 0;
  return sku.srp;
}

function mixPesoFor(sku: DemandPlanSkuInput): number {
  if (effectiveSrp(sku) <= 0) return 0;
  return Number.isFinite(sku.historyPeso) ? Math.max(0, sku.historyPeso) : 0;
}

function resolveQuotaPeso(parameters: DemandPlanParameters, skus: DemandPlanSkuInput[]): number {
  if (parameters.quotaMode === "branch_target") {
    const explicit = parameters.quotaPeso;
    if (explicit == null || !Number.isFinite(explicit) || explicit < 0) {
      throw new Error("Branch target quota ₱ is required when quota mode is branch_target.");
    }
    return roundMoney(explicit);
  }

  let total = 0;
  for (const sku of skus) {
    const srp = effectiveSrp(sku);
    if (srp <= 0) continue;
    total += nonNegativeInt(sku.forecastQty) * srp;
  }
  return roundMoney(total);
}

function adjustedMixByIndex(
  skus: DemandPlanSkuInput[],
  hmix: number[],
): number[] {
  const adj = hmix.map((value, index) => (isPlanogramY(skus[index].planogramFlag) ? value : 0));

  const seriesIndexes = new Map<string, number[]>();
  skus.forEach((sku, index) => {
    const list = seriesIndexes.get(sku.series) ?? [];
    list.push(index);
    seriesIndexes.set(sku.series, list);
  });

  for (const indexes of seriesIndexes.values()) {
    let spill = 0;
    let planogramMixSum = 0;
    const planogramIndexes: number[] = [];

    for (const index of indexes) {
      const flag = skus[index].planogramFlag;
      if (isFreeFlag(flag)) continue;
      if (isPlanogramY(flag)) {
        planogramIndexes.push(index);
        planogramMixSum += hmix[index];
      } else {
        spill += hmix[index];
      }
    }

    if (spill <= 0 || planogramIndexes.length === 0) continue;
    if (planogramMixSum <= 0) continue;

    for (const index of planogramIndexes) {
      adj[index] += spill * (hmix[index] / planogramMixSum);
    }
  }

  return adj;
}

function diiDays(stagePeso: number, quotaPeso: number, monthBasisDays: number): number {
  if (quotaPeso <= 0) return 0;
  return (stagePeso / quotaPeso) * monthBasisDays;
}

function emptyTotals(): DemandPlanTotals {
  return {
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
  };
}

/**
 * Shared seven-move demand plan for one branch.
 *
 * HMIX → ADJ HMIX (series spill) → MIL → Alloc = max(0, MIL − DU − EI + FC)
 * → Drop 1 = max(0, round(Alloc ÷ monthBasis × minDays) − EI).
 */
export function computeDemandPlan(input: DemandPlanInput): DemandPlanResult {
  const parameters = input.parameters;
  const monthBasisDays =
    Number.isFinite(parameters.monthBasisDays) && parameters.monthBasisDays > 0
      ? parameters.monthBasisDays
      : MONTH_BASIS_DAYS;
  const dropsPerMonth = parameters.dropsPerMonth;

  if (!Number.isFinite(dropsPerMonth) || dropsPerMonth <= 0) {
    throw new Error("Delivery frequency (drops per month) must be greater than 0.");
  }

  const skus = input.skus;
  const quotaPeso = resolveQuotaPeso(parameters, skus);
  const minLevelDays = monthBasisDays / dropsPerMonth;
  const minLevelPeso = roundMoney(quotaPeso / monthBasisDays * minLevelDays);

  const mixPesos = skus.map((sku) => mixPesoFor(sku));
  const branchMixPeso = mixPesos.reduce((sum, value) => sum + value, 0);
  const hmix = mixPesos.map((peso) => (branchMixPeso > 0 ? peso / branchMixPeso : 0));
  const adjHmix = adjustedMixByIndex(skus, hmix);

  const lines: DemandPlanLine[] = skus.map((sku, index) => {
    const srp = sku.srp;
    const mixSrp = effectiveSrp(sku);
    const displayUnits = nonNegativeInt(sku.displayUnits);
    const onHandQty = nonNegativeInt(sku.onHandQty);
    const forecastQty = nonNegativeInt(sku.forecastQty);
    const mixShare = adjHmix[index];

    let milRaw = 0;
    if (mixSrp > 0 && minLevelPeso > 0 && mixShare > 0) {
      milRaw = minLevelPeso * mixShare / mixSrp;
    }

    let milQty = roundQty(milRaw);
    if (
      parameters.roundUpToOne &&
      isPlanogramY(sku.planogramFlag) &&
      mixSrp > 0 &&
      milQty === 0 &&
      milRaw > 0
    ) {
      milQty = 1;
    }

    const milPeso = roundMoney(milQty * mixSrp);
    const forecastPeso = roundMoney(forecastQty * mixSrp);

    let allocRaw = milQty - displayUnits - onHandQty + forecastQty;
    if (mixSrp <= 0) allocRaw = 0;
    const allocQty = parameters.floorAllocationAtZero ? Math.max(0, allocRaw) : allocRaw;
    const allocPeso = roundMoney(allocQty * mixSrp);

    const cycleQty = roundQty(allocQty / monthBasisDays * minLevelDays);
    const drop1Qty = Math.max(0, cycleQty - onHandQty);
    const drop1Peso = roundMoney(drop1Qty * mixSrp);

    const totalInventoryQty = milQty + displayUnits + onHandQty + forecastQty;
    const totalInventoryPeso = roundMoney(
      milPeso + displayUnits * mixSrp + onHandQty * mixSrp + forecastPeso,
    );

    return {
      sku: sku.sku,
      series: sku.series,
      srp,
      planogramFlag: sku.planogramFlag,
      historyQty: sku.historyQty,
      historyPeso: sku.historyPeso,
      mixPeso: mixPesos[index],
      hmix: hmix[index],
      adjHmix: mixShare,
      milQty,
      milPeso,
      displayUnits,
      onHandQty,
      forecastQty,
      forecastPeso,
      allocQty,
      allocPeso,
      cycleQty,
      drop1Qty,
      drop1Peso,
      totalInventoryQty,
      totalInventoryPeso,
    };
  });

  const totals = lines.reduce<DemandPlanTotals>((sum, line) => {
    sum.historyQty += line.historyQty;
    sum.historyPeso += line.mixPeso;
    sum.milQty += line.milQty;
    sum.milPeso += line.milPeso;
    sum.displayUnits += line.displayUnits;
    sum.onHandQty += line.onHandQty;
    sum.onHandPeso += line.onHandQty * effectiveSrp(line);
    sum.forecastQty += line.forecastQty;
    sum.forecastPeso += line.forecastPeso;
    sum.allocQty += line.allocQty;
    sum.allocPeso += line.allocPeso;
    sum.cycleQty += line.cycleQty;
    sum.drop1Qty += line.drop1Qty;
    sum.drop1Peso += line.drop1Peso;
    sum.totalInventoryQty += line.totalInventoryQty;
    sum.totalInventoryPeso += line.totalInventoryPeso;
    if (isPlanogramY(line.planogramFlag)) sum.planogramSkuCount += 1;
    return sum;
  }, emptyTotals());

  totals.historyPeso = roundMoney(totals.historyPeso);
  totals.milPeso = roundMoney(totals.milPeso);
  totals.onHandPeso = roundMoney(totals.onHandPeso);
  totals.forecastPeso = roundMoney(totals.forecastPeso);
  totals.allocPeso = roundMoney(totals.allocPeso);
  totals.drop1Peso = roundMoney(totals.drop1Peso);
  totals.totalInventoryPeso = roundMoney(totals.totalInventoryPeso);

  const coverage: DemandPlanCoverage = {
    historyDays: diiDays(totals.historyPeso, quotaPeso, monthBasisDays),
    milDays: diiDays(totals.milPeso, quotaPeso, monthBasisDays),
    displayUnitsDays: diiDays(
      roundMoney(
        lines.reduce((sum, line) => sum + line.displayUnits * effectiveSrp(line), 0),
      ),
      quotaPeso,
      monthBasisDays,
    ),
    onHandDays: diiDays(totals.onHandPeso, quotaPeso, monthBasisDays),
    forecastDays: diiDays(totals.forecastPeso, quotaPeso, monthBasisDays),
    allocationDays: diiDays(totals.allocPeso, quotaPeso, monthBasisDays),
    drop1Days: diiDays(totals.drop1Peso, quotaPeso, monthBasisDays),
    totalInventoryDays: diiDays(totals.totalInventoryPeso, quotaPeso, monthBasisDays),
    targetDays: minLevelDays,
  };

  const seriesBuckets = new Map<string, { history: number; mil: number }>();
  for (const line of lines) {
    const bucket = seriesBuckets.get(line.series) ?? { history: 0, mil: 0 };
    bucket.history += line.mixPeso;
    bucket.mil += line.milPeso;
    seriesBuckets.set(line.series, bucket);
  }

  const mixBySeries: DemandPlanSeriesMix[] = [...seriesBuckets.entries()]
    .map(([series, bucket]) => ({
      series,
      historyShare: totals.historyPeso > 0 ? bucket.history / totals.historyPeso : 0,
      milShare: totals.milPeso > 0 ? bucket.mil / totals.milPeso : 0,
    }))
    .sort((a, b) => b.historyShare - a.historyShare);

  const hasHistory = lines.some((line) => line.mixPeso > 0 || (effectiveSrp(line) > 0 && line.historyQty > 0));

  return {
    quotaPeso,
    minLevelDays,
    minLevelPeso,
    dropsPerMonth,
    monthBasisDays,
    planStatus: hasHistory ? "planned" : "no_history",
    lines,
    totals,
    coverage,
    mixBySeries,
  };
}
