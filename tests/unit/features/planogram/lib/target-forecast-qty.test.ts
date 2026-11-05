import { DROPS_PER_MONTH } from "@/features/demand-planning/engine/demand-planning.constants";
import {
  computeTargetForecastQty,
  describeMaxQtyCalc,
  latestDisplayUnitsByPair,
  parseMaxQtyCalc,
  planForecastRefresh,
  TARGET_FORECAST_FORMULA,
  type MaxQtyCalc,
  type RefreshPlanogramRow,
} from "@/features/planogram/lib/target-forecast-qty";

const COMPUTED_AT = "2026-11-04T04:00:00.000Z";

function row(overrides: Partial<RefreshPlanogramRow> = {}): RefreshPlanogramRow {
  return {
    id: "p1",
    branchId: "b1",
    branchName: "Makati",
    modelId: "m1",
    skuCode: "32STW101",
    maxQty: 3,
    maxQtyEditedAt: null,
    maxQtyCalc: null,
    ...overrides,
  };
}

function plan(
  rows: RefreshPlanogramRow[],
  inputs: {
    forecast?: [string, number][];
    du?: [string, number][];
    frequency?: [string, string | null][];
  } = {},
) {
  return planForecastRefresh({
    rows,
    forecastByPair: new Map(inputs.forecast ?? []),
    displayUnitsByPair: new Map(inputs.du ?? []),
    frequencyByBranch: new Map(inputs.frequency ?? [["b1", "weekly"]]),
    periodLabel: "Nov-26",
    computedAt: COMPUTED_AT,
  });
}

describe("computeTargetForecastQty", () => {
  it("applies (forecast + DU) / frequency", () => {
    expect(
      computeTargetForecastQty({ forecastQty: 20, displayUnits: 4, dropsPerMonth: 4 }),
    ).toBe(6);
  });

  it("rounds a partial unit up so a forecast SKU is never left at 0", () => {
    expect(
      computeTargetForecastQty({ forecastQty: 1, displayUnits: 0, dropsPerMonth: 4 }),
    ).toBe(1);
  });

  it("returns 0 when forecast and DU are both 0", () => {
    expect(
      computeTargetForecastQty({ forecastQty: 0, displayUnits: 0, dropsPerMonth: 4 }),
    ).toBe(0);
  });

  it("does not round up on floating point noise from a fractional frequency", () => {
    expect(
      computeTargetForecastQty({
        forecastQty: 20,
        displayUnits: 0,
        dropsPerMonth: DROPS_PER_MONTH.triweekly,
      }),
    ).toBe(15);
  });

  it("rejects a frequency that is not positive", () => {
    expect(() =>
      computeTargetForecastQty({ forecastQty: 1, displayUnits: 0, dropsPerMonth: 0 }),
    ).toThrow("Delivery frequency");
  });
});

describe("planForecastRefresh", () => {
  it("writes the computed value and records its inputs", () => {
    const { updates } = plan([row()], {
      forecast: [["b1:m1", 20]],
      du: [["b1:m1", 4]],
    });

    expect(updates).toEqual([
      expect.objectContaining({
        id: "p1",
        maxQty: 6,
        previousMaxQty: 3,
        maxQtyCalc: {
          forecastQty: 20,
          displayUnits: 4,
          dropsPerMonth: 4,
          frequencyMissing: false,
          periodLabel: "Nov-26",
          computedAt: COMPUTED_AT,
          overriddenManualQty: null,
        },
      }),
    ]);
  });

  it("uses 0 for a missing forecast and a missing DU, and counts both", () => {
    const { updates, summary } = plan([row()]);

    expect(updates[0].maxQty).toBe(0);
    expect(summary.zeroForecastCount).toBe(1);
    expect(summary.zeroDuCount).toBe(1);
  });

  it("replaces a manual edit and reports what it replaced", () => {
    const { updates, summary } = plan(
      [row({ maxQty: 12, maxQtyEditedAt: new Date("2026-11-01T00:00:00.000Z") })],
      { forecast: [["b1:m1", 20]] },
    );

    expect(updates[0].maxQty).toBe(5);
    expect(updates[0].maxQtyCalc.overriddenManualQty).toBe(12);
    expect(summary.overriddenCount).toBe(1);
    expect(summary.overriddenRows).toEqual([
      { branchName: "Makati", sku: "32STW101", fromQty: 12, toQty: 5 },
    ]);
  });

  it("clears the manual flag without reporting when the edit equals the computed value", () => {
    const { updates, summary } = plan(
      [row({ maxQty: 5, maxQtyEditedAt: new Date("2026-11-01T00:00:00.000Z") })],
      { forecast: [["b1:m1", 20]] },
    );

    expect(updates).toHaveLength(1);
    expect(updates[0].maxQtyCalc.overriddenManualQty).toBeNull();
    expect(summary.overriddenCount).toBe(0);
  });

  it("does not treat a value that was never edited by hand as overridden", () => {
    const { summary } = plan([row({ maxQty: 9 })], { forecast: [["b1:m1", 20]] });

    expect(summary.overriddenCount).toBe(0);
    expect(summary.changedCount).toBe(1);
  });

  it("falls back to monthly and flags a branch with no delivery schedule", () => {
    const { updates, summary } = plan([row()], {
      forecast: [["b1:m1", 20]],
      frequency: [["b1", null]],
    });

    expect(updates[0].maxQty).toBe(20);
    expect(updates[0].maxQtyCalc.frequencyMissing).toBe(true);
    expect(summary.missingFrequencyCount).toBe(1);
  });

  it("skips a row whose value and inputs already match, but still counts its notices", () => {
    const existing: MaxQtyCalc = {
      forecastQty: 0,
      displayUnits: 0,
      dropsPerMonth: 4,
      frequencyMissing: false,
      periodLabel: "Nov-26",
      computedAt: "2026-11-01T00:00:00.000Z",
      overriddenManualQty: null,
    };

    const { updates, summary } = plan([row({ maxQty: 0, maxQtyCalc: existing })]);

    expect(updates).toEqual([]);
    expect(summary.rowCount).toBe(1);
    expect(summary.zeroForecastCount).toBe(1);
  });

  it("caps the overridden list but keeps the full count", () => {
    const rows = Array.from({ length: 60 }, (_, index) =>
      row({
        id: `p${index}`,
        modelId: `m${index}`,
        maxQty: 12,
        maxQtyEditedAt: new Date("2026-11-01T00:00:00.000Z"),
      }),
    );

    const { summary } = plan(rows);

    expect(summary.overriddenCount).toBe(60);
    expect(summary.overriddenRows).toHaveLength(50);
  });
});

describe("latestDisplayUnitsByPair", () => {
  it("keeps the first row per pair from a newest-first list", () => {
    const result = latestDisplayUnitsByPair([
      { branchId: "b1", modelId: "m1", displayUnits: 4 },
      { branchId: "b1", modelId: "m1", displayUnits: 9 },
      { branchId: "b1", modelId: "m2", displayUnits: 0 },
    ]);

    expect(result.get("b1:m1")).toBe(4);
    expect(result.get("b1:m2")).toBe(0);
  });
});

describe("parseMaxQtyCalc", () => {
  it("returns null for a value that is not a calculation", () => {
    expect(parseMaxQtyCalc(null)).toBeNull();
    expect(parseMaxQtyCalc({ forecastQty: "20" })).toBeNull();
  });
});

describe("describeMaxQtyCalc", () => {
  const calc: MaxQtyCalc = {
    forecastQty: 20,
    displayUnits: 4,
    dropsPerMonth: 4,
    frequencyMissing: false,
    periodLabel: "Nov-26",
    computedAt: COMPUTED_AT,
    overriddenManualQty: null,
  };

  it("shows the worked calculation with no notices when every input has a value", () => {
    expect(describeMaxQtyCalc(calc, false)).toEqual({
      calculation: "(20 + 4) ÷ 4 = 6",
      notices: [],
    });
  });

  it("says when DU is 0", () => {
    expect(describeMaxQtyCalc({ ...calc, displayUnits: 0 }, false).notices).toContain(
      "DU is currently 0.",
    );
  });

  it("says when the SKU forecast is 0", () => {
    expect(describeMaxQtyCalc({ ...calc, forecastQty: 0 }, false).notices).toContain(
      "Forecast for this SKU is 0 in Nov-26.",
    );
  });

  it("says when a manual value was replaced", () => {
    expect(
      describeMaxQtyCalc({ ...calc, overriddenManualQty: 12 }, false).notices,
    ).toContain("Manual value 12 was replaced by the Nov-26 forecast upload.");
  });

  it("says when the frequency fell back to monthly", () => {
    expect(
      describeMaxQtyCalc({ ...calc, dropsPerMonth: 1, frequencyMissing: true }, false).notices,
    ).toContain("No delivery schedule, so frequency is treated as 1 per month.");
  });

  it("hides the calculation once the value was edited by hand", () => {
    expect(describeMaxQtyCalc(calc, true)).toEqual({
      calculation: null,
      notices: ["Edited by hand. The next forecast upload replaces it."],
    });
  });

  it("labels a value no forecast upload has calculated yet", () => {
    expect(describeMaxQtyCalc(null, false)).toEqual({
      calculation: null,
      notices: ["Not calculated yet. Updates on the next forecast upload."],
    });
  });

  it("formats a fractional frequency", () => {
    expect(
      describeMaxQtyCalc({ ...calc, dropsPerMonth: 4 / 3 }, false).calculation,
    ).toBe("(20 + 4) ÷ 1.33 = 18");
  });
});

describe("TARGET_FORECAST_FORMULA", () => {
  it("states the client's formula", () => {
    expect(TARGET_FORECAST_FORMULA).toBe("(Target forecast qty + current DU) ÷ frequency");
  });
});
