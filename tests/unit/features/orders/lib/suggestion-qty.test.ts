import {
  lineWasHandEdited,
  outstandingSupply,
  planningPoolKey,
  planningRemaining,
  shelfGapSuggestion,
  shelfPoolKey,
  sourceChanged,
  suggestionPoolKey,
} from "@/features/orders/lib/suggestion-qty";

describe("planningRemaining", () => {
  it("subtracts partial allocation and legacy unallocated orders", () => {
    expect(
      planningRemaining({
        releasedDrop1Qty: 10,
        allocatedQty: 4,
        legacyUnallocatedQty: 3,
      }),
    ).toBe(3);
  });

  it("floors at zero when covered quantity exceeds the released drop", () => {
    expect(
      planningRemaining({
        releasedDrop1Qty: 5,
        allocatedQty: 4,
        legacyUnallocatedQty: 3,
      }),
    ).toBe(0);
  });

  it("does not subtract stock again; Drop 1 is already net of on-hand", () => {
    const releasedDrop1Qty = 8;
    const allocatedQty = 2;
    const legacyUnallocatedQty = 1;
    const stkQty = 6;

    expect(
      planningRemaining({
        releasedDrop1Qty,
        allocatedQty,
        legacyUnallocatedQty,
      }),
    ).toBe(5);

    // Subtracting STK a second time would wipe the remainder (8 - 2 - 1 - 6).
    expect(releasedDrop1Qty - allocatedQty - legacyUnallocatedQty - stkQty).toBe(-1);
  });
});

describe("shelfGapSuggestion", () => {
  it("subtracts STK and outstanding supply once", () => {
    expect(
      shelfGapSuggestion({
        shelfMax: 10,
        stkQty: 3,
        outstandingQty: 4,
      }),
    ).toEqual({ canCalculate: true, suggestedQty: 3 });
  });

  it("floors at zero when stock and outstanding already cover the shelf", () => {
    expect(
      shelfGapSuggestion({
        shelfMax: 5,
        stkQty: 2,
        outstandingQty: 4,
      }),
    ).toEqual({ canCalculate: true, suggestedQty: 0 });
  });

  it("treats a zero shelf maximum as a real maximum", () => {
    expect(
      shelfGapSuggestion({
        shelfMax: 0,
        stkQty: 0,
        outstandingQty: 0,
      }),
    ).toEqual({ canCalculate: true, suggestedQty: 0 });
  });

  it("cannot calculate when there is no planogram maximum", () => {
    expect(
      shelfGapSuggestion({
        shelfMax: null,
        stkQty: 2,
        outstandingQty: 1,
      }),
    ).toEqual({ canCalculate: false, suggestedQty: 0 });

    expect(
      shelfGapSuggestion({
        shelfMax: undefined,
        stkQty: 0,
        outstandingQty: 0,
      }),
    ).toEqual({ canCalculate: false, suggestedQty: 0 });
  });
});

describe("outstandingSupply", () => {
  it("counts each ordered unit once and adds only orphan DIT", () => {
    expect(
      outstandingSupply({
        orderRemainders: [
          { lineQty: 5, serialsAlreadyStk: 2 },
          { lineQty: 1, serialsAlreadyStk: 4 },
        ],
        orphanDitQty: 2,
      }),
    ).toBe(5);
  });

  it("does not add in-transit units that already sit inside an order remainder", () => {
    expect(
      outstandingSupply({
        orderRemainders: [{ lineQty: 4, serialsAlreadyStk: 1 }],
        orphanDitQty: 0,
      }),
    ).toBe(3);
  });
});

describe("sourceChanged", () => {
  it("flags a new published quantity without writing a replacement line qty", () => {
    const line = { lineQty: 4, allocatedQty: 4 };

    expect(sourceChanged({ sourceQty: line.allocatedQty, currentPublishedQty: 7 })).toBe(true);
    expect(line.lineQty).toBe(4);
    expect(lineWasHandEdited(line)).toBe(false);
  });

  it("stays false when the published suggestion still matches the applied source", () => {
    expect(sourceChanged({ sourceQty: 4, currentPublishedQty: 4 })).toBe(false);
  });
});

describe("lineWasHandEdited", () => {
  it("detects a draft quantity that no longer matches the allocation", () => {
    expect(lineWasHandEdited({ lineQty: 2, allocatedQty: 5 })).toBe(true);
    expect(lineWasHandEdited({ lineQty: 5, allocatedQty: 5 })).toBe(false);
  });
});

describe("suggestion pool keys", () => {
  it("uses period, branch, model, and order type for planning", () => {
    const key = planningPoolKey({
      periodId: "period-1",
      branchId: "branch-1",
      modelId: "model-1",
      orderType: "auto_replenish",
    });

    expect(key).toBe("planning_drop1|period-1|branch-1|model-1|auto_replenish");
    expect(
      suggestionPoolKey({
        sourceKind: "planning_drop1",
        periodId: "period-1",
        branchId: "branch-1",
        modelId: "model-1",
        orderType: "auto_replenish",
      }),
    ).toBe(key);
  });

  it("uses branch, model, and order type for shelf gap", () => {
    const key = shelfPoolKey({
      branchId: "branch-1",
      modelId: "model-1",
      orderType: "manual",
    });

    expect(key).toBe("shelf_gap|branch-1|model-1|manual");
    expect(key).not.toContain("period-1");
    expect(
      suggestionPoolKey({
        sourceKind: "shelf_gap",
        branchId: "branch-1",
        modelId: "model-1",
        orderType: "manual",
      }),
    ).toBe(key);
  });
});
