/**
 * Display rules for the order sheet. No database access.
 * Auto replenish Suggest uses remaining released Drop 1.
 * Manual and special keep the shelf gap computed by the worksheet.
 */

import { NO_PLANNING_SUGGESTION_MESSAGE } from "@/features/orders/lib/suggestion-apply-decisions";
import { planningRemaining } from "@/features/orders/lib/suggestion-qty";

export { NO_PLANNING_SUGGESTION_MESSAGE };

export interface PlanningSuggestionCoverage {
  releasedDrop1Qty: number;
  allocatedQty: number;
  legacyUnallocatedQty: number;
}

export type AutoReplenishSuggestionInput =
  | { released: false }
  | ({ released: true } & PlanningSuggestionCoverage);

/**
 * Remaining Drop 1 after draft and order allocations.
 * A plan that was never released has no number to show.
 */
export function worksheetAutoReplenishSuggestion(
  input: AutoReplenishSuggestionInput,
): { sugQty: number | null; suggestionUnavailableReason: string | null } {
  if (!input.released) {
    return {
      sugQty: null,
      suggestionUnavailableReason: NO_PLANNING_SUGGESTION_MESSAGE,
    };
  }

  return {
    sugQty: planningRemaining({
      releasedDrop1Qty: input.releasedDrop1Qty,
      allocatedQty: input.allocatedQty,
      legacyUnallocatedQty: input.legacyUnallocatedQty,
    }),
    suggestionUnavailableReason: null,
  };
}

export function applyAutoReplenishWorksheetSuggestions<
  T extends {
    modelId: string;
    sugQty: number | null;
    suggestionUnavailableReason: string | null;
  },
>(
  lines: readonly T[],
  planning:
    | { released: false }
    | { released: true; byModel: ReadonlyMap<string, PlanningSuggestionCoverage> },
): T[] {
  return lines.map((line) => {
    if (!planning.released) {
      return { ...line, ...worksheetAutoReplenishSuggestion({ released: false }) };
    }
    const coverage = planning.byModel.get(line.modelId);
    return {
      ...line,
      ...worksheetAutoReplenishSuggestion({
        released: true,
        releasedDrop1Qty: coverage?.releasedDrop1Qty ?? 0,
        allocatedQty: coverage?.allocatedQty ?? 0,
        legacyUnallocatedQty: coverage?.legacyUnallocatedQty ?? 0,
      }),
    };
  });
}

/** Quantity times unit CBM when a quantity is entered. Otherwise the unit CBM. */
export function worksheetLineCbm(quantity: number, unitCbm: number): number {
  const unit = Number.isFinite(unitCbm) ? unitCbm : 0;
  if (Number.isFinite(quantity) && quantity >= 1) return quantity * unit;
  return unit;
}

export function formatWorksheetCbm(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return safe.toFixed(4);
}
