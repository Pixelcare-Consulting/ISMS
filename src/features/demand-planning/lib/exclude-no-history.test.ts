import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isNoHistoryPlanStatus,
  partitionBranchesBySalesHistory,
} from "./exclude-no-history";

describe("isNoHistoryPlanStatus", () => {
  it("matches the engine no_history label", () => {
    assert.equal(isNoHistoryPlanStatus("no_history"), true);
    assert.equal(isNoHistoryPlanStatus("planned"), false);
    assert.equal(isNoHistoryPlanStatus("awaiting"), false);
  });
});

describe("partitionBranchesBySalesHistory", () => {
  it("keeps planned branches and lists no_history as excluded", () => {
    const { kept, excluded } = partitionBranchesBySalesHistory([
      { branchId: "a", planStatus: "planned" },
      { branchId: "b", planStatus: "no_history" },
      { branchId: "c", planStatus: "planned" },
      { branchId: "d", planStatus: "no_history" },
    ]);
    assert.deepEqual(
      kept.map((row) => row.branchId),
      ["a", "c"],
    );
    assert.deepEqual(
      excluded.map((row) => row.branchId),
      ["b", "d"],
    );
  });

  it("returns empty kept when every branch has no history", () => {
    const { kept, excluded } = partitionBranchesBySalesHistory([
      { branchId: "x", planStatus: "no_history" },
    ]);
    assert.equal(kept.length, 0);
    assert.equal(excluded.length, 1);
  });
});
