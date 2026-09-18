import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  drop1QtyForRelease,
  freezeReleasedDrop1Qty,
  orderDetailsFromDrop1Lines,
  shouldSkipBranchForRelease,
} from "./release-lines";

describe("release to ordering", () => {
  it("does not skip branches by plan status alone", () => {
    assert.equal(shouldSkipBranchForRelease("planned"), false);
    assert.equal(shouldSkipBranchForRelease("no_history"), false);
    assert.equal(shouldSkipBranchForRelease("awaiting"), false);
  });

  it("drops zero Drop 1 lines and freezes computed qty", () => {
    const details = orderDetailsFromDrop1Lines([
      { modelId: "keep", computedDrop1Qty: 4.8 },
      { modelId: "zero", computedDrop1Qty: 0 },
      { modelId: "neg", computedDrop1Qty: -2 },
    ]);
    assert.deepEqual(details, [{ modelId: "keep", quantity: 4 }]);
    assert.equal(drop1QtyForRelease(4.8), 4);
    assert.equal(freezeReleasedDrop1Qty(7), 7);
  });
});
