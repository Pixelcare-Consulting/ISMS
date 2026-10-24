/**
 * Remaining suggestion quantity. Pure rules only — no database access.
 *
 * `sourceKind` on `OrderSuggestionAllocation` is stored as text. The only
 * application values are this union.
 */
export const SUGGESTION_SOURCE_KINDS = ["planning_drop1", "shelf_gap"] as const;

export type SuggestionSourceKind = (typeof SUGGESTION_SOURCE_KINDS)[number];

/** Matches `BranchOrderType` without importing the Prisma client. */
export const SUGGESTION_ORDER_TYPES = ["auto_replenish", "manual", "special"] as const;

export type SuggestionOrderType = (typeof SUGGESTION_ORDER_TYPES)[number];

const POOL_KEY_SEPARATOR = "|";

export type PlanningRemainingInput = {
  /** Frozen Drop 1. Planning already netted on-hand into this number. */
  releasedDrop1Qty: number;
  /** Sum of allocatedQty on orders that are still covering the pool. */
  allocatedQty: number;
  /** Historical order qty for this pool that has no allocation row yet. */
  legacyUnallocatedQty: number;
};

/**
 * Remaining planning suggestion.
 * Do not subtract STK again — Drop 1 is already net of on-hand.
 */
export function planningRemaining({
  releasedDrop1Qty,
  allocatedQty,
  legacyUnallocatedQty,
}: PlanningRemainingInput): number {
  return Math.max(0, releasedDrop1Qty - allocatedQty - legacyUnallocatedQty);
}

export type ShelfGapSuggestion =
  | { canCalculate: false; suggestedQty: 0 }
  | { canCalculate: true; suggestedQty: number };

/**
 * Manual shelf gap. No planogram maximum means a suggestion cannot be calculated.
 * Outstanding supply is subtracted once; it is not added on top of STK a second time.
 */
export function shelfGapSuggestion(input: {
  shelfMax: number | null | undefined;
  stkQty: number;
  outstandingQty: number;
}): ShelfGapSuggestion {
  if (input.shelfMax == null) {
    return { canCalculate: false, suggestedQty: 0 };
  }

  return {
    canCalculate: true,
    suggestedQty: Math.max(0, input.shelfMax - input.stkQty - input.outstandingQty),
  };
}

export type OrderRemainderInput = {
  lineQty: number;
  /** Serials from this order's delivery that are already STK. */
  serialsAlreadyStk: number;
};

/**
 * Outstanding supply, each unit once.
 * `orderRemainders` already exclude serials received into STK.
 * `orphanDitQty` is only DIT whose delivery is not already covered by those lines.
 */
export function outstandingSupply(input: {
  orderRemainders: readonly OrderRemainderInput[];
  orphanDitQty: number;
}): number {
  const fromOrders = input.orderRemainders.reduce(
    (sum, remainder) => sum + Math.max(0, remainder.lineQty - remainder.serialsAlreadyStk),
    0,
  );
  return fromOrders + input.orphanDitQty;
}

/**
 * Published suggestion differs from the quantity stored at apply time.
 * This is a flag only. It must not be treated as a new line quantity to write.
 */
export function sourceChanged(input: { sourceQty: number; currentPublishedQty: number }): boolean {
  return input.currentPublishedQty !== input.sourceQty;
}

/** The draft line was edited after apply when its quantity no longer matches the allocation. */
export function lineWasHandEdited(input: { lineQty: number; allocatedQty: number }): boolean {
  return input.lineQty !== input.allocatedQty;
}

export type PlanningPoolKeyInput = {
  periodId: string;
  branchId: string;
  modelId: string;
  orderType: SuggestionOrderType;
};

export type ShelfPoolKeyInput = {
  branchId: string;
  modelId: string;
  orderType: SuggestionOrderType;
};

export type SuggestionPoolKeyInput =
  | (PlanningPoolKeyInput & { sourceKind: "planning_drop1" })
  | (ShelfPoolKeyInput & { sourceKind: "shelf_gap" });

/** Stable pool key: period + branch + model + order type. */
export function planningPoolKey(input: PlanningPoolKeyInput): string {
  return ["planning_drop1", input.periodId, input.branchId, input.modelId, input.orderType].join(
    POOL_KEY_SEPARATOR,
  );
}

/** Stable pool key: branch + model + order type. Period is not part of a shelf-gap pool. */
export function shelfPoolKey(input: ShelfPoolKeyInput): string {
  return ["shelf_gap", input.branchId, input.modelId, input.orderType].join(POOL_KEY_SEPARATOR);
}

export function suggestionPoolKey(input: SuggestionPoolKeyInput): string {
  switch (input.sourceKind) {
    case "planning_drop1":
      return planningPoolKey(input);
    case "shelf_gap":
      return shelfPoolKey(input);
    default: {
      const _exhaustive: never = input;
      throw new Error(`Unhandled suggestion source: ${String(_exhaustive)}`);
    }
  }
}
