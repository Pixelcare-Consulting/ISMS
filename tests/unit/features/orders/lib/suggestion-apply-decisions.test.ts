import {
  additionalPlanningQty,
  decideAllocationEdit,
  decideApplyQuantity,
  HAND_EDITED_REVIEW_MESSAGE,
  NO_PLANOGRAM_MAX_MESSAGE,
  outstandingByModel,
  publishedShelfGap,
  SPECIAL_NO_SUGGESTION_MESSAGE,
  suggestionLineFitsRemaining,
} from "@/features/orders/lib/suggestion-apply-decisions";
import { shelfGapSuggestion } from "@/features/orders/lib/suggestion-qty";

describe("suggestion apply decisions", () => {
  it("keeps a second apply from taking units already allocated", () => {
    const first = decideApplyQuantity({
      requestedQty: 5,
      remaining: 5,
      existing: null,
    });
    expect(first).toEqual({ kind: "add", quantityToAdd: 5, nextAllocatedQty: 5 });

    const second = decideApplyQuantity({
      requestedQty: 5,
      remaining: additionalPlanningQty({
        releasedDrop1Qty: 5,
        allocatedQty: 5,
        legacyUnallocatedQty: 0,
      }),
      existing: { lineQty: 5, allocatedQty: 5 },
    });
    expect(second.kind).toBe("reject");
  });

  it("leaves the unselected remainder available", () => {
    const partial = decideApplyQuantity({
      requestedQty: 2,
      remaining: 5,
      existing: null,
    });
    expect(partial).toMatchObject({ kind: "add", quantityToAdd: 2 });
    expect(
      additionalPlanningQty({
        releasedDrop1Qty: 5,
        allocatedQty: 2,
        legacyUnallocatedQty: 0,
      }),
    ).toBe(3);
  });

  it("does not overwrite a hand-edited line and does not double-count covered qty", () => {
    const decision = decideApplyQuantity({
      requestedQty: 2,
      remaining: additionalPlanningQty({
        releasedDrop1Qty: 12,
        allocatedQty: 10,
        legacyUnallocatedQty: 0,
      }),
      existing: { lineQty: 7, allocatedQty: 10 },
    });
    expect(decision).toEqual({ kind: "review", message: HAND_EDITED_REVIEW_MESSAGE });
    expect(
      additionalPlanningQty({
        releasedDrop1Qty: 12,
        allocatedQty: 10,
        legacyUnallocatedQty: 0,
      }),
    ).toBe(2);
  });

  it("counts manual outstanding once and skips a suggestion when shelf max is missing", () => {
    const outstanding = outstandingByModel({
      lines: [
        {
          modelId: "model-1",
          lineQty: 4,
          serialsAlreadyStk: 0,
          deliveryIds: ["delivery-1"],
        },
      ],
      ditSerials: [
        { modelId: "model-1", deliveryIds: ["delivery-1"] },
        { modelId: "model-1", deliveryIds: ["delivery-1"] },
        { modelId: "model-1", deliveryIds: ["delivery-1"] },
        { modelId: "model-1", deliveryIds: ["delivery-1"] },
        { modelId: "model-1", deliveryIds: ["delivery-2"] },
      ],
    });
    expect(outstanding.get("model-1")).toBe(5);
    expect(publishedShelfGap({ shelfMax: 10, stkQty: 3, outstandingQty: 5 })).toBe(2);

    const missing = shelfGapSuggestion({ shelfMax: null, stkQty: 3, outstandingQty: 0 });
    expect(missing).toEqual({ canCalculate: false, suggestedQty: 0 });
    expect(publishedShelfGap({ shelfMax: null, stkQty: 3, outstandingQty: 0 })).toBeNull();
    expect(NO_PLANOGRAM_MAX_MESSAGE).toMatch(/cannot be calculated/i);
  });

  it("gives special orders no suggested quantity", () => {
    expect(SPECIAL_NO_SUGGESTION_MESSAGE).toBe("Special orders have no suggested quantity.");
  });

  it("shrinks an allocation when the edited qty drops and rejects a delta the pool cannot cover", () => {
    expect(
      decideAllocationEdit({ nextQty: 4, allocatedQty: 10, remaining: 0, skuCode: "SKU-1" }),
    ).toEqual({ ok: true, allocatedQty: 4 });
    expect(
      decideAllocationEdit({ nextQty: 12, allocatedQty: 10, remaining: 1, skuCode: "SKU-1" }).ok,
    ).toBe(false);
    expect(
      decideAllocationEdit({ nextQty: 12, allocatedQty: 10, remaining: 2, skuCode: "SKU-1" }),
    ).toEqual({ ok: true, allocatedQty: 12 });
  });

  it("allows submit of the line's own allocation plus whatever is still free", () => {
    expect(
      suggestionLineFitsRemaining({ lineQty: 10, allocatedQty: 10, remaining: 0 }),
    ).toBe(true);
    expect(
      suggestionLineFitsRemaining({ lineQty: 13, allocatedQty: 10, remaining: 2 }),
    ).toBe(false);
  });
});
