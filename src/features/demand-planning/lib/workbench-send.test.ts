import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  orderDetailsFromSelectedDrop1,
  workbenchOverrideDiffs,
} from "@/features/demand-planning/lib/workbench-send";

describe("workbench supplementary send", () => {
  it("keeps selected positive Drop 1 lines and skips zeroes", () => {
    const { details, skippedZeroCount } = orderDetailsFromSelectedDrop1(
      [
        { modelId: "keep", computedDrop1Qty: 4.2 },
        { modelId: "zero", computedDrop1Qty: 0 },
        { modelId: "unselected", computedDrop1Qty: 9 },
      ],
      ["keep", "zero"],
    );
    assert.deepEqual(details, [{ modelId: "keep", quantity: 4 }]);
    assert.equal(skippedZeroCount, 1);
  });

  it("records only DU and FC values that differ from computed sources", () => {
    const diffs = workbenchOverrideDiffs({
      facts: [
        {
          modelId: "m1",
          computedDisplayUnits: 0,
          displayUnits: 0,
          computedForecastQty: 8,
          forecastQty: 8,
        },
      ],
      overrides: [
        { modelId: "m1", displayUnits: 2, forecastQty: 8 },
        { modelId: "missing", displayUnits: 1, forecastQty: 1 },
      ],
    });
    assert.deepEqual(diffs, [
      { modelId: "m1", field: "displayUnits", beforeValue: "0", afterValue: "2" },
    ]);
  });
});
