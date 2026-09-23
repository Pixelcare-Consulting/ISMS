import type { DemandPlanParameters } from "./demand-planning.types";

/** PDF month basis. */
export const MONTH_BASIS_DAYS = 30.5;

/**
 * Drops per month from `DeliveryFrequency`.
 * weekly=4, thrice_monthly=3, monthly=1 (plan open item 08).
 */
export const DROPS_PER_MONTH = {
  weekly: 4,
  twice_weekly: 8,
  biweekly: 2,
  triweekly: 4 / 3,
  monthly: 1,
  daily: 26,
  thrice_monthly: 3,
} as const;

export type DeliveryFrequencyKey = keyof typeof DROPS_PER_MONTH;

export const DEFAULT_DEMAND_PLAN_PARAMETERS: DemandPlanParameters = {
  monthBasisDays: MONTH_BASIS_DAYS,
  dropsPerMonth: DROPS_PER_MONTH.weekly,
  roundUpToOne: true,
  floorAllocationAtZero: true,
  quotaMode: "derive_from_forecast",
};

export function dropsPerMonthForFrequency(frequency: string): number {
  if (frequency in DROPS_PER_MONTH) {
    return DROPS_PER_MONTH[frequency as DeliveryFrequencyKey];
  }
  return DROPS_PER_MONTH.monthly;
}
