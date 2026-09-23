import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildBranchSkuFacts,
  collectUniverseModelIds,
  toDemandPlanSkuInput,
} from "./sku-input-builder";

describe("sku input builder", () => {
  it("unions planogram, allowed, history, and forecast SKUs", () => {
    const ids = collectUniverseModelIds({
      planogramModelIds: ["a"],
      allowedModelIds: ["b"],
      historyModelIds: ["c"],
      forecastModelIds: ["a", "d"],
    });
    assert.deepEqual(ids.sort(), ["a", "b", "c", "d"]);
  });

  it("flags planogram Y, free SRP 0, and blank otherwise", () => {
    const facts = buildBranchSkuFacts({
      universeModelIds: ["pm", "hist", "free"],
      models: new Map([
        ["pm", { modelId: "pm", skuCode: "SKU-PM", series: "S", srp: 1000 }],
        ["hist", { modelId: "hist", skuCode: "SKU-H", series: "S", srp: 500 }],
        ["free", { modelId: "free", skuCode: "SKU-F", series: "S", srp: 0 }],
      ]),
      planogramModelIds: new Set(["pm", "free"]),
      historyTotals: new Map([
        ["hist", { qty: 6, peso: 3000 }],
        ["pm", { qty: 3, peso: 3000 }],
      ]),
      onHandQty: new Map([["pm", 2]]),
      forecastQty: new Map([["pm", 4]]),
      displayUnits: new Map(),
    });

    const bySku = new Map(facts.map((fact) => [fact.skuCode, toDemandPlanSkuInput(fact)]));
    assert.equal(bySku.get("SKU-PM")?.planogramFlag, "Y");
    assert.equal(bySku.get("SKU-H")?.planogramFlag, "blank");
    assert.equal(bySku.get("SKU-F")?.planogramFlag, "free");
    assert.equal(bySku.get("SKU-H")?.historyQty, 2);
    assert.equal(bySku.get("SKU-PM")?.displayUnits, 0);
    assert.equal(bySku.get("SKU-PM")?.forecastQty, 4);
    assert.equal(bySku.get("SKU-PM")?.onHandQty, 2);
  });
});
