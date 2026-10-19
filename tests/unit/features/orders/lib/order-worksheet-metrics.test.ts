import { NO_PLANNING_SUGGESTION_MESSAGE } from "@/features/orders/lib/suggestion-apply-decisions";
import {
  applyAutoReplenishWorksheetSuggestions,
  formatWorksheetCbm,
  worksheetAutoReplenishSuggestion,
  worksheetLineCbm,
} from "@/features/orders/lib/order-worksheet-metrics";
import { buildApprovalTimeline } from "@/features/orders/lib/order-approval-timeline";

describe("worksheet auto replenish suggestion", () => {
  it("says no planning suggestion when nothing is released", () => {
    expect(worksheetAutoReplenishSuggestion({ released: false })).toEqual({
      sugQty: null,
      suggestionUnavailableReason: NO_PLANNING_SUGGESTION_MESSAGE,
    });
  });

  it("uses remaining Drop 1 after draft and order allocations", () => {
    expect(
      worksheetAutoReplenishSuggestion({
        released: true,
        releasedDrop1Qty: 10,
        allocatedQty: 4,
        legacyUnallocatedQty: 1,
      }),
    ).toEqual({ sugQty: 5, suggestionUnavailableReason: null });
  });

  it("shows zero when the released plan has no Drop 1 for the model", () => {
    const [line] = applyAutoReplenishWorksheetSuggestions(
      [
        {
          modelId: "m1",
          sugQty: 50,
          suggestionUnavailableReason: null,
        },
      ],
      { released: true, byModel: new Map() },
    );
    expect(line).toMatchObject({ sugQty: 0, suggestionUnavailableReason: null });
  });
});

describe("worksheet line CBM", () => {
  it("uses quantity times unit CBM when a quantity is entered", () => {
    expect(worksheetLineCbm(3, 0.25)).toBeCloseTo(0.75);
    expect(formatWorksheetCbm(worksheetLineCbm(3, 0.25))).toBe("0.7500");
  });

  it("uses the unit CBM when no quantity is entered", () => {
    expect(worksheetLineCbm(0, 0.25)).toBeCloseTo(0.25);
  });

  it("shows 0.0000 when the model has no CBM", () => {
    expect(formatWorksheetCbm(worksheetLineCbm(4, Number.NaN))).toBe("0.0000");
    expect(formatWorksheetCbm(worksheetLineCbm(0, 0))).toBe("0.0000");
  });
});

describe("approval timeline", () => {
  it("keeps pending steps on the line before anyone acts", () => {
    const steps = buildApprovalTimeline("auto_replenish", []);
    expect(steps.map((step) => [step.roleLabel, step.outcome])).toEqual([
      ["Team Leader", "pending"],
      ["Supply Planning", "pending"],
    ]);
  });
});
