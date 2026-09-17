import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeDemandPlan } from "@/features/demand-planning/engine/demand-planning.engine";
import {
  applyWorkbenchFactOverride,
  computeWorkbenchGrid,
  drop1SelectedIds,
  gridLinesFromDemandPlan,
  resetWorkbenchFacts,
  skuInputFromWorkbenchFact,
} from "@/features/demand-planning/lib/workbench-grid";
import type { WorkbenchSkuFact } from "@/features/demand-planning/types/workbench.types";

function sampleFact(overrides: Partial<WorkbenchSkuFact> = {}): WorkbenchSkuFact {
  return {
    modelId: "m1",
    skuCode: "SKU-1",
    seriesCode: "S",
    srp: 100,
    planogramFlag: "Y",
    historyQty: 10,
    historyPeso: 1000,
    computedDisplayUnits: 0,
    displayUnits: 0,
    onHandQty: 0,
    computedForecastQty: 8,
    forecastQty: 8,
    ...overrides,
  };
}

describe("workbench live grid mapping", () => {
  it("uses modelId as the grid line id and never stamps released Drop 1", () => {
    const facts = [sampleFact()];
    const result = computeDemandPlan({
      parameters: {
        monthBasisDays: 30.5,
        dropsPerMonth: 4,
        roundUpToOne: true,
        floorAllocationAtZero: true,
        quotaMode: "derive_from_forecast",
      },
      skus: facts.map(skuInputFromWorkbenchFact),
    });
    const lines = gridLinesFromDemandPlan(facts, result);
    assert.equal(lines[0]?.id, "m1");
    assert.equal(lines[0]?.releasedDrop1Qty, null);
    assert.equal(lines[0]?.forecastQty, 8);
  });

  it("recomputes Drop 1 after a DU override without mutating source facts until applied", () => {
    const facts = [sampleFact({ forecastQty: 12, computedForecastQty: 12 })];
    const baseline = computeWorkbenchGrid({
      facts,
      dropsPerMonth: 4,
      quotaMode: "derive_from_forecast",
    });
    const nextFacts = applyWorkbenchFactOverride(facts, "m1", "displayUnits", 2);
    const overridden = computeWorkbenchGrid({
      facts: nextFacts,
      dropsPerMonth: 4,
      quotaMode: "derive_from_forecast",
    });
    assert.equal(facts[0]?.displayUnits, 0);
    assert.equal(nextFacts[0]?.displayUnits, 2);
    assert.ok(overridden.lines[0]!.computedDrop1Qty <= baseline.lines[0]!.computedDrop1Qty);
  });

  it("reset restores DU and FC to computed sources", () => {
    const facts = applyWorkbenchFactOverride(
      [sampleFact({ computedDisplayUnits: 1, displayUnits: 4, forecastQty: 2 })],
      "m1",
      "forecastQty",
      9,
    );
    const reset = resetWorkbenchFacts(facts);
    assert.equal(reset[0]?.displayUnits, 1);
    assert.equal(reset[0]?.forecastQty, 8);
  });

  it("selects only positive Drop 1 rows", () => {
    const ids = drop1SelectedIds([
      {
        id: "keep",
        runBranchId: "",
        modelId: "keep",
        skuCode: "A",
        seriesCode: "S",
        srp: 1,
        planogramFlag: "Y",
        historyQty: 0,
        historyPeso: 0,
        hmix: 0,
        adjHmix: 0,
        milQty: 0,
        milPeso: 0,
        computedDisplayUnits: 0,
        displayUnits: 0,
        onHandQty: 0,
        computedForecastQty: 0,
        forecastQty: 0,
        forecastPeso: 0,
        allocQty: 0,
        allocPeso: 0,
        cycleQty: 0,
        computedDrop1Qty: 3,
        releasedDrop1Qty: null,
        drop1Peso: 0,
        totalInventoryQty: 0,
        totalInventoryPeso: 0,
      },
      {
        id: "zero",
        runBranchId: "",
        modelId: "zero",
        skuCode: "B",
        seriesCode: "S",
        srp: 1,
        planogramFlag: "Y",
        historyQty: 0,
        historyPeso: 0,
        hmix: 0,
        adjHmix: 0,
        milQty: 0,
        milPeso: 0,
        computedDisplayUnits: 0,
        displayUnits: 0,
        onHandQty: 0,
        computedForecastQty: 0,
        forecastQty: 0,
        forecastPeso: 0,
        allocQty: 0,
        allocPeso: 0,
        cycleQty: 0,
        computedDrop1Qty: 0,
        releasedDrop1Qty: null,
        drop1Peso: 0,
        totalInventoryQty: 0,
        totalInventoryPeso: 0,
      },
    ]);
    assert.deepEqual(ids, ["keep"]);
  });
});
