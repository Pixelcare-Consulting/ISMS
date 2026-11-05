/**
 * Max Qty from Planning. Pure rules only, safe to import from client components.
 *
 * The client's formula is kept exactly, including DU being divided by frequency.
 * Inputs are stored on the row so the value can be explained later.
 */
import { dropsPerMonthForFrequency } from "@/features/demand-planning/engine/demand-planning.constants";

export const TARGET_FORECAST_FORMULA = "(Target forecast qty + current DU) ÷ frequency";

/** Keeps the upload response small. The full count is always reported. */
const MAX_OVERRIDDEN_ROWS = 50;

/** Absorbs floating point noise from fractional frequencies such as 4/3. */
const QTY_DECIMALS = 6;

const FALLBACK_FREQUENCY = "monthly";

export type MaxQtyCalc = {
  forecastQty: number;
  displayUnits: number;
  dropsPerMonth: number;
  /** The branch has no delivery schedule, so Planning's monthly fallback applied. */
  frequencyMissing: boolean;
  periodLabel: string;
  computedAt: string;
  /** Manual value this upload replaced, if any. */
  overriddenManualQty: number | null;
};

export type RefreshPlanogramRow = {
  id: string;
  branchId: string;
  branchName: string;
  modelId: string;
  skuCode: string;
  maxQty: number;
  maxQtyEditedAt: Date | null;
  maxQtyCalc: unknown;
};

export type PlanogramRefreshUpdate = {
  id: string;
  branchId: string;
  modelId: string;
  maxQty: number;
  previousMaxQty: number;
  maxQtyCalc: MaxQtyCalc;
};

export type OverriddenPlanogramRow = {
  branchName: string;
  sku: string;
  fromQty: number;
  toQty: number;
};

export type PlanogramRefreshSummary = {
  rowCount: number;
  changedCount: number;
  zeroForecastCount: number;
  zeroDuCount: number;
  missingFrequencyCount: number;
  overriddenCount: number;
  overriddenRows: OverriddenPlanogramRow[];
};

export const EMPTY_PLANOGRAM_REFRESH_SUMMARY: PlanogramRefreshSummary = {
  rowCount: 0,
  changedCount: 0,
  zeroForecastCount: 0,
  zeroDuCount: 0,
  missingFrequencyCount: 0,
  overriddenCount: 0,
  overriddenRows: [],
};

export function planogramPairKey(branchId: string, modelId: string): string {
  return `${branchId}:${modelId}`;
}

/** Rounds up so a SKU with any forecast never computes to 0 and blocks ordering. */
export function computeTargetForecastQty(input: {
  forecastQty: number;
  displayUnits: number;
  dropsPerMonth: number;
}): number {
  if (!Number.isFinite(input.dropsPerMonth) || input.dropsPerMonth <= 0) {
    throw new Error("Delivery frequency (drops per month) must be greater than 0.");
  }
  const qty = (input.forecastQty + input.displayUnits) / input.dropsPerMonth;
  return Math.ceil(Number(qty.toFixed(QTY_DECIMALS)));
}

/** Expects rows newest run first. */
export function latestDisplayUnitsByPair(
  rows: readonly { branchId: string; modelId: string; displayUnits: number }[],
): Map<string, number> {
  const latest = new Map<string, number>();
  for (const row of rows) {
    const key = planogramPairKey(row.branchId, row.modelId);
    if (!latest.has(key)) latest.set(key, row.displayUnits);
  }
  return latest;
}

export function parseMaxQtyCalc(value: unknown): MaxQtyCalc | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const calc = value as Record<string, unknown>;
  if (
    typeof calc.forecastQty !== "number" ||
    typeof calc.displayUnits !== "number" ||
    typeof calc.dropsPerMonth !== "number" ||
    typeof calc.frequencyMissing !== "boolean" ||
    typeof calc.periodLabel !== "string" ||
    typeof calc.computedAt !== "string"
  ) {
    return null;
  }
  return {
    forecastQty: calc.forecastQty,
    displayUnits: calc.displayUnits,
    dropsPerMonth: calc.dropsPerMonth,
    frequencyMissing: calc.frequencyMissing,
    periodLabel: calc.periodLabel,
    computedAt: calc.computedAt,
    overriddenManualQty:
      typeof calc.overriddenManualQty === "number" ? calc.overriddenManualQty : null,
  };
}

function sameInputs(previous: MaxQtyCalc | null, next: MaxQtyCalc): boolean {
  return (
    previous != null &&
    previous.forecastQty === next.forecastQty &&
    previous.displayUnits === next.displayUnits &&
    previous.dropsPerMonth === next.dropsPerMonth &&
    previous.frequencyMissing === next.frequencyMissing &&
    previous.periodLabel === next.periodLabel
  );
}

export function planForecastRefresh(input: {
  rows: readonly RefreshPlanogramRow[];
  forecastByPair: ReadonlyMap<string, number>;
  displayUnitsByPair: ReadonlyMap<string, number>;
  frequencyByBranch: ReadonlyMap<string, string | null>;
  periodLabel: string;
  computedAt: string;
}): { updates: PlanogramRefreshUpdate[]; summary: PlanogramRefreshSummary } {
  const updates: PlanogramRefreshUpdate[] = [];
  const summary: PlanogramRefreshSummary = {
    ...EMPTY_PLANOGRAM_REFRESH_SUMMARY,
    overriddenRows: [],
    rowCount: input.rows.length,
  };

  for (const row of input.rows) {
    const key = planogramPairKey(row.branchId, row.modelId);
    const forecastQty = input.forecastByPair.get(key) ?? 0;
    const displayUnits = input.displayUnitsByPair.get(key) ?? 0;
    const frequency = input.frequencyByBranch.get(row.branchId) ?? null;
    const dropsPerMonth = dropsPerMonthForFrequency(frequency ?? FALLBACK_FREQUENCY);
    const maxQty = computeTargetForecastQty({ forecastQty, displayUnits, dropsPerMonth });

    if (forecastQty === 0) summary.zeroForecastCount += 1;
    if (displayUnits === 0) summary.zeroDuCount += 1;
    if (frequency == null) summary.missingFrequencyCount += 1;

    const editedByHand = row.maxQtyEditedAt != null;
    const overridden = editedByHand && row.maxQty !== maxQty;
    if (overridden) {
      summary.overriddenCount += 1;
      if (summary.overriddenRows.length < MAX_OVERRIDDEN_ROWS) {
        summary.overriddenRows.push({
          branchName: row.branchName,
          sku: row.skuCode,
          fromQty: row.maxQty,
          toQty: maxQty,
        });
      }
    }

    const maxQtyCalc: MaxQtyCalc = {
      forecastQty,
      displayUnits,
      dropsPerMonth,
      frequencyMissing: frequency == null,
      periodLabel: input.periodLabel,
      computedAt: input.computedAt,
      overriddenManualQty: overridden ? row.maxQty : null,
    };

    const unchanged =
      !editedByHand &&
      row.maxQty === maxQty &&
      sameInputs(parseMaxQtyCalc(row.maxQtyCalc), maxQtyCalc);
    if (unchanged) continue;

    if (row.maxQty !== maxQty) summary.changedCount += 1;
    updates.push({
      id: row.id,
      branchId: row.branchId,
      modelId: row.modelId,
      maxQty,
      previousMaxQty: row.maxQty,
      maxQtyCalc,
    });
  }

  return { updates, summary };
}

function formatFrequency(dropsPerMonth: number): string {
  return String(Number(dropsPerMonth.toFixed(2)));
}

/** Plain text for the planogram table, so a value can be read without opening anything. */
export function describeMaxQtyCalc(
  calc: MaxQtyCalc | null,
  editedByHand: boolean,
): { calculation: string | null; notices: string[] } {
  if (editedByHand) {
    return {
      calculation: null,
      notices: ["Edited by hand. The next forecast upload replaces it."],
    };
  }
  if (!calc) {
    return {
      calculation: null,
      notices: ["Not calculated yet. Updates on the next forecast upload."],
    };
  }

  const result = computeTargetForecastQty(calc);
  const notices: string[] = [];
  if (calc.forecastQty === 0) {
    notices.push(`Forecast for this SKU is 0 in ${calc.periodLabel}.`);
  }
  if (calc.displayUnits === 0) notices.push("DU is currently 0.");
  if (calc.frequencyMissing) {
    notices.push(
      `No delivery schedule, so frequency is treated as ${formatFrequency(calc.dropsPerMonth)} per month.`,
    );
  }
  if (calc.overriddenManualQty != null) {
    notices.push(
      `Manual value ${calc.overriddenManualQty} was replaced by the ${calc.periodLabel} forecast upload.`,
    );
  }

  return {
    calculation: `(${calc.forecastQty} + ${calc.displayUnits}) ÷ ${formatFrequency(calc.dropsPerMonth)} = ${result}`,
    notices,
  };
}
