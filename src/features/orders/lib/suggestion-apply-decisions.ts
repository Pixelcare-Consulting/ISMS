import {
  lineWasHandEdited,
  outstandingSupply,
  planningRemaining,
  shelfGapSuggestion,
  sourceChanged,
  type PlanningRemainingInput,
} from "@/features/orders/lib/suggestion-qty";

export const NO_PLANNING_SUGGESTION_MESSAGE = "No planning suggestion available.";

export const SPECIAL_NO_SUGGESTION_MESSAGE = "Special orders have no suggested quantity.";

export const NO_PLANOGRAM_MAX_MESSAGE =
  "A suggestion cannot be calculated without a planogram shelf maximum.";

export const HAND_EDITED_REVIEW_MESSAGE =
  "This line was edited on the draft. Review the draft before adding more of this model.";

export const SUGGESTION_CLOSED_ORDER_STATUSES = ["rejected", "cancelled"] as const;

export type ApplyQuantityDecision =
  | { kind: "reject"; message: string }
  | { kind: "review"; message: string }
  | { kind: "add"; quantityToAdd: number; nextAllocatedQty: number };

/**
 * Whether a selected quantity may be added to the open draft.
 * A hand-edited line is left unchanged. Requested quantity is an increment,
 * so it is compared with remaining (units not already allocated).
 */
export function decideApplyQuantity(input: {
  requestedQty: number;
  remaining: number;
  existing: { lineQty: number; allocatedQty: number } | null;
}): ApplyQuantityDecision {
  if (!Number.isInteger(input.requestedQty) || input.requestedQty < 1) {
    return { kind: "reject", message: "Quantity must be at least 1." };
  }

  if (
    input.existing &&
    lineWasHandEdited({
      lineQty: input.existing.lineQty,
      allocatedQty: input.existing.allocatedQty,
    })
  ) {
    return { kind: "review", message: HAND_EDITED_REVIEW_MESSAGE };
  }

  if (input.requestedQty > input.remaining) {
    return {
      kind: "reject",
      message: `Quantity exceeds the remaining suggestion (${input.remaining}).`,
    };
  }

  const already = input.existing?.allocatedQty ?? 0;
  return {
    kind: "add",
    quantityToAdd: input.requestedQty,
    nextAllocatedQty: already + input.requestedQty,
  };
}

export type AllocationEditDecision =
  | { ok: true; allocatedQty: number }
  | { ok: false; message: string };

/**
 * Draft line edit. Shrink the allocation when the line drops below it.
 * Grow it only by the delta, and only when remaining still has those units.
 * The caller's quantity is kept; planning changes never replace it.
 */
export function decideAllocationEdit(input: {
  nextQty: number;
  allocatedQty: number;
  remaining: number;
  skuCode: string;
}): AllocationEditDecision {
  if (!Number.isInteger(input.nextQty) || input.nextQty < 1) {
    return { ok: false, message: "Quantity must be at least 1." };
  }

  if (input.nextQty <= input.allocatedQty) {
    return { ok: true, allocatedQty: input.nextQty };
  }

  const delta = input.nextQty - input.allocatedQty;
  if (delta > input.remaining) {
    return {
      ok: false,
      message: `Quantity for ${input.skuCode} exceeds the remaining suggestion (${input.remaining} still available).`,
    };
  }

  return { ok: true, allocatedQty: input.nextQty };
}

/** Submit allows this line's own allocation back on top of what is still free. */
export function suggestionLineFitsRemaining(input: {
  lineQty: number;
  allocatedQty: number;
  remaining: number;
}): boolean {
  return input.lineQty <= input.remaining + input.allocatedQty;
}

export function submitAllocationMessage(skuCode: string, allowed: number): string {
  return `Quantity for ${skuCode} exceeds the remaining suggestion (${allowed} allowed including what this line already holds).`;
}

export function planningSuggestionChanged(input: {
  sourceQty: number | null;
  releasedDrop1Qty: number;
}): boolean {
  if (input.sourceQty == null) return false;
  return sourceChanged({
    sourceQty: input.sourceQty,
    currentPublishedQty: input.releasedDrop1Qty,
  });
}

/** Shelf-gap flag compares the gap with this draft line's own units removed. */
export function shelfSuggestionChanged(input: {
  sourceQty: number | null;
  shelfMax: number | null | undefined;
  stkQty: number;
  outstandingExcludingLine: number;
}): boolean {
  if (input.sourceQty == null) return false;
  const published = shelfGapSuggestion({
    shelfMax: input.shelfMax,
    stkQty: input.stkQty,
    outstandingQty: input.outstandingExcludingLine,
  });
  if (!published.canCalculate) return false;
  return sourceChanged({
    sourceQty: input.sourceQty,
    currentPublishedQty: published.suggestedQty,
  });
}

export function publishedShelfGap(input: {
  shelfMax: number | null | undefined;
  stkQty: number;
  outstandingQty: number;
}): number | null {
  const gap = shelfGapSuggestion(input);
  if (!gap.canCalculate) return null;
  return gap.suggestedQty;
}

export type OutstandingLineInput = {
  modelId: string;
  lineQty: number;
  serialsAlreadyStk: number;
  deliveryIds: string[];
};

export type DitSerialInput = {
  modelId: string;
  deliveryIds: string[];
};

/**
 * Outstanding supply per model. In-transit serials on a delivery already
 * covered by an order line are not added again.
 */
export function outstandingByModel(input: {
  lines: readonly OutstandingLineInput[];
  ditSerials: readonly DitSerialInput[];
}): Map<string, number> {
  const coveredByModel = new Map<string, Set<string>>();
  const remainders = new Map<string, { lineQty: number; serialsAlreadyStk: number }[]>();

  for (const line of input.lines) {
    const list = remainders.get(line.modelId) ?? [];
    list.push({ lineQty: line.lineQty, serialsAlreadyStk: line.serialsAlreadyStk });
    remainders.set(line.modelId, list);

    const covered = coveredByModel.get(line.modelId) ?? new Set<string>();
    for (const deliveryId of line.deliveryIds) covered.add(deliveryId);
    coveredByModel.set(line.modelId, covered);
  }

  const orphanByModel = new Map<string, number>();
  for (const serial of input.ditSerials) {
    const covered = coveredByModel.get(serial.modelId) ?? new Set<string>();
    const alreadyCovered = serial.deliveryIds.some((deliveryId) => covered.has(deliveryId));
    if (alreadyCovered) continue;
    orphanByModel.set(serial.modelId, (orphanByModel.get(serial.modelId) ?? 0) + 1);
  }

  const modelIds = new Set<string>([...remainders.keys(), ...orphanByModel.keys()]);
  const result = new Map<string, number>();
  for (const modelId of modelIds) {
    result.set(
      modelId,
      outstandingSupply({
        orderRemainders: remainders.get(modelId) ?? [],
        orphanDitQty: orphanByModel.get(modelId) ?? 0,
      }),
    );
  }
  return result;
}

export function countSerialsAlreadyStk(input: {
  modelId: string;
  stkCodeId: string | null;
  deliveryLines: readonly { serialModelId: string; statusCodeId: string | null }[];
}): number {
  if (!input.stkCodeId) return 0;
  return input.deliveryLines.filter(
    (line) => line.serialModelId === input.modelId && line.statusCodeId === input.stkCodeId,
  ).length;
}

/** Additional planning units still free. Does not subtract on-hand again. */
export function additionalPlanningQty(input: PlanningRemainingInput): number {
  return planningRemaining(input);
}
