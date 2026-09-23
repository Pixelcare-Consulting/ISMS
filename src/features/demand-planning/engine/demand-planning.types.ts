/**
 * Pure demand-planning types. No Prisma — the calculator and golden tests share these.
 */

export type PlanogramFlag = "Y" | "blank" | "free";

export type DemandPlanQuotaMode = "derive_from_forecast" | "branch_target";

export type DemandPlanBranchStatus = "planned" | "no_history";

export interface DemandPlanSkuInput {
  sku: string;
  series: string;
  /** List price. Free / SRP-0 items never enter the value mix. */
  srp: number;
  planogramFlag: PlanogramFlag;
  /** 3-month average sold qty. */
  historyQty: number;
  /** 3-month average sold ₱. */
  historyPeso: number;
  displayUnits: number;
  onHandQty: number;
  forecastQty: number;
}

export interface DemandPlanParameters {
  /** Calendar month basis. PDF default 30.5. */
  monthBasisDays: number;
  /** Deliveries per month (weekly=4, thrice_monthly=3, monthly=1, …). */
  dropsPerMonth: number;
  /** One-facing minimum when a planogram SKU would otherwise round to 0 MIL. */
  roundUpToOne: boolean;
  /** Floor month allocation at 0. */
  floorAllocationAtZero: boolean;
  quotaMode: DemandPlanQuotaMode;
  /** Used when quotaMode is branch_target (BranchForecastTarget). */
  quotaPeso?: number;
}

export interface DemandPlanInput {
  parameters: DemandPlanParameters;
  skus: DemandPlanSkuInput[];
}

/** JSON snapshot stored on DemandPlanningRun.parameters. */
export interface DemandPlanningRunParameters {
  monthBasisDays: number;
  roundUpToOne: boolean;
  floorAllocationAtZero: boolean;
  quotaMode: DemandPlanQuotaMode;
  frequencyOverride: number | null;
}

/** JSON snapshot stored on DemandPlanningRun.scope. */
export interface DemandPlanningRunScope {
  dealerIds: string[];
  branchIds: string[];
}

export interface DemandPlanLine {
  sku: string;
  series: string;
  srp: number;
  planogramFlag: PlanogramFlag;
  historyQty: number;
  historyPeso: number;
  /** Peso that entered HMIX (0 for Free / SRP 0). */
  mixPeso: number;
  hmix: number;
  adjHmix: number;
  milQty: number;
  milPeso: number;
  displayUnits: number;
  onHandQty: number;
  forecastQty: number;
  forecastPeso: number;
  allocQty: number;
  allocPeso: number;
  cycleQty: number;
  drop1Qty: number;
  drop1Peso: number;
  totalInventoryQty: number;
  totalInventoryPeso: number;
}

export interface DemandPlanTotals {
  historyQty: number;
  historyPeso: number;
  milQty: number;
  milPeso: number;
  displayUnits: number;
  onHandQty: number;
  onHandPeso: number;
  forecastQty: number;
  forecastPeso: number;
  allocQty: number;
  allocPeso: number;
  cycleQty: number;
  drop1Qty: number;
  drop1Peso: number;
  totalInventoryQty: number;
  totalInventoryPeso: number;
  planogramSkuCount: number;
}

export interface DemandPlanCoverage {
  /** stage ₱ ÷ quota × month basis. */
  historyDays: number;
  milDays: number;
  displayUnitsDays: number;
  onHandDays: number;
  forecastDays: number;
  allocationDays: number;
  drop1Days: number;
  totalInventoryDays: number;
  /** Min-level days (monthBasis ÷ dropsPerMonth). */
  targetDays: number;
}

export interface DemandPlanSeriesMix {
  series: string;
  historyShare: number;
  milShare: number;
}

export interface DemandPlanResult {
  quotaPeso: number;
  minLevelDays: number;
  minLevelPeso: number;
  dropsPerMonth: number;
  monthBasisDays: number;
  planStatus: DemandPlanBranchStatus;
  lines: DemandPlanLine[];
  totals: DemandPlanTotals;
  coverage: DemandPlanCoverage;
  mixBySeries: DemandPlanSeriesMix[];
}
