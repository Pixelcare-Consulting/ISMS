import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { persistableBranchFromResult } from "./line-mapper";
import type { DemandPlanResult } from "@/features/demand-planning/engine/demand-planning.types";

function emptyTotals(): DemandPlanResult["totals"] {
  return {
    historyQty: 1,
    historyPeso: 100,
    milQty: 2,
    milPeso: 200,
    displayUnits: 0,
    onHandQty: 1,
    onHandPeso: 50,
    forecastQty: 3,
    forecastPeso: 300,
    allocQty: 4,
    allocPeso: 400,
    cycleQty: 1,
    drop1Qty: 5,
    drop1Peso: 500,
    totalInventoryQty: 6,
    totalInventoryPeso: 600,
    planogramSkuCount: 1,
  };
}

describe("persistableBranchFromResult", () => {
  it("maps engine lines with model ids and keeps computed DU/FC", () => {
    const result: DemandPlanResult = {
      quotaPeso: 1000,
      minLevelDays: 7.625,
      minLevelPeso: 250,
      dropsPerMonth: 4,
      monthBasisDays: 30.5,
      planStatus: "planned",
      lines: [
        {
          sku: "SKU-1",
          series: "S",
          srp: 100,
          planogramFlag: "Y",
          historyQty: 1,
          historyPeso: 100,
          mixPeso: 100,
          hmix: 1,
          adjHmix: 1,
          milQty: 2,
          milPeso: 200,
          displayUnits: 1,
          onHandQty: 0,
          forecastQty: 3,
          forecastPeso: 300,
          allocQty: 4,
          allocPeso: 400,
          cycleQty: 1,
          drop1Qty: 5,
          drop1Peso: 500,
          totalInventoryQty: 6,
          totalInventoryPeso: 600,
        },
      ],
      totals: emptyTotals(),
      coverage: {
        historyDays: 1,
        milDays: 2,
        displayUnitsDays: 0,
        onHandDays: 0,
        forecastDays: 3,
        allocationDays: 4,
        drop1Days: 5,
        totalInventoryDays: 6,
        targetDays: 7.625,
      },
      mixBySeries: [],
    };

    const persistable = persistableBranchFromResult({
      branchId: "b1",
      result,
      modelIdBySku: new Map([["SKU-1", "m1"]]),
      computedBySku: new Map([["SKU-1", { displayUnits: 0, forecastQty: 8 }]]),
    });

    assert.equal(persistable.planStatus, "planned");
    assert.equal(persistable.drop1Qty, 5);
    assert.equal(persistable.lines[0]?.modelId, "m1");
    assert.equal(persistable.lines[0]?.displayUnits, 1);
    assert.equal(persistable.lines[0]?.computedDisplayUnits, 0);
    assert.equal(persistable.lines[0]?.forecastQty, 3);
    assert.equal(persistable.lines[0]?.computedForecastQty, 8);
    assert.equal(persistable.lines[0]?.computedDrop1Qty, 5);
  });
});
