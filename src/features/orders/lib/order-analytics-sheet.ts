import type { BranchOrderType } from "@prisma/client";

import { NO_PLANNING_SUGGESTION_MESSAGE } from "@/features/orders/lib/order-worksheet-metrics";

export interface AnalyticsSuggestInput {
  orderType: BranchOrderType;
  /** Shelf maximum minus units on hand. */
  shelfGapQty: number;
  /** Remaining quantity from the released plan, when this order type uses it. */
  planQty?: number | null;
  planUnavailable?: boolean;
}

export type AnalyticsSuggestDisplay =
  | { kind: "qty"; qty: number }
  | { kind: "unavailable"; message: string };

/**
 * Suggest on order analytics follows the order type.
 * Manual and special stay on the shelf gap. Auto replenish uses the released plan.
 */
export function analyticsLineSuggest(input: AnalyticsSuggestInput): AnalyticsSuggestDisplay {
  switch (input.orderType) {
    case "auto_replenish":
      if (input.planUnavailable || input.planQty == null) {
        return { kind: "unavailable", message: NO_PLANNING_SUGGESTION_MESSAGE };
      }
      return { kind: "qty", qty: input.planQty };
    case "manual":
    case "special":
      return { kind: "qty", qty: input.shelfGapQty };
    default: {
      const _exhaustive: never = input.orderType;
      return _exhaustive;
    }
  }
}

export function analyticsSuggestHelp(orderType: BranchOrderType): string {
  switch (orderType) {
    case "auto_replenish":
      return "Remaining quantity from the released plan for this branch and model. When the model has a shelf maximum, it is shown under the suggestion.";
    case "manual":
    case "special":
      return "Shelf gap. Shelf maximum minus units on hand. The shelf maximum is shown under the suggestion. This is not a quantity on the order.";
    default: {
      const _exhaustive: never = orderType;
      return _exhaustive;
    }
  }
}

export interface AnalyticsMetricLine {
  stkQty: number;
  ditQty: number;
  srp: number;
  salesAmount: number;
  salesQty: number;
  milQty: number;
  milDays: number;
}

export interface AnalyticsMetricStrip {
  computedDii: number | null;
  inventoryAmount: number;
  stkCount: number;
  ditCount: number;
  salesQty: number;
  targetDays: number | null;
}

/** Same days-of-cover math as branch order analytics, for the rows on screen. */
export function analyticsMetricStrip(
  lines: readonly AnalyticsMetricLine[],
  daysElapsed: number,
): AnalyticsMetricStrip {
  let inventoryAmount = 0;
  let stkCount = 0;
  let ditCount = 0;
  let salesAmount = 0;
  let salesQty = 0;
  for (const line of lines) {
    inventoryAmount += line.stkQty * line.srp;
    stkCount += line.stkQty;
    ditCount += line.ditQty;
    salesAmount += line.salesAmount;
    salesQty += line.salesQty;
  }
  const elapsed = daysElapsed > 0 ? daysElapsed : 1;
  const dailySales = salesAmount > 0 ? salesAmount / elapsed : 0;
  return {
    computedDii: dailySales > 0 ? inventoryAmount / dailySales : null,
    inventoryAmount,
    stkCount,
    ditCount,
    salesQty,
    targetDays: typicalMilDays(lines.map((line) => line.milDays)),
  };
}

function typicalMilDays(thresholds: readonly number[]): number | null {
  if (thresholds.length === 0) return null;
  const counts = new Map<number, number>();
  for (const days of thresholds) {
    if (!Number.isFinite(days)) continue;
    counts.set(days, (counts.get(days) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestCount = 0;
  for (const [days, count] of counts) {
    if (best == null || count > bestCount || (count === bestCount && days < best)) {
      best = days;
      bestCount = count;
    }
  }
  return best;
}
