import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BRANCH1_DEC2025_EXPECTED, BRANCH1_DEC2025_INPUT } from "./branch-1-dec-2025.fixture";
import { computeDemandPlan } from "./demand-planning.engine";
import type { DemandPlanSkuInput } from "./demand-planning.types";

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

describe("computeDemandPlan — PDF Branch 1 / Dec 2025", () => {
  const result = computeDemandPlan(BRANCH1_DEC2025_INPUT);
  const expected = BRANCH1_DEC2025_EXPECTED;

  it("matches Drop 1 and month allocation totals (zero variance)", () => {
    assert.equal(result.totals.allocQty, expected.allocQty);
    assert.equal(result.totals.allocPeso, expected.allocPeso);
    assert.equal(result.totals.drop1Qty, expected.drop1Qty);
    assert.equal(result.totals.drop1Peso, expected.drop1Peso);
  });

  it("matches quota, MIL, history, on-hand, and forecast stamps", () => {
    assert.equal(result.quotaPeso, expected.quotaPeso);
    assert.equal(result.minLevelPeso, expected.minLevelPeso);
    assert.equal(result.minLevelDays, expected.minLevelDays);
    assert.equal(result.totals.historyPeso, expected.historyPeso);
    assert.equal(result.totals.milQty, expected.milQty);
    assert.equal(result.totals.milPeso, expected.milPeso);
    assert.equal(result.totals.displayUnits, expected.displayUnits);
    assert.equal(result.totals.onHandQty, expected.onHandQty);
    assert.equal(result.totals.onHandPeso, expected.onHandPeso);
    assert.equal(result.totals.forecastQty, expected.forecastQty);
    assert.equal(result.totals.forecastPeso, expected.forecastPeso);
    assert.equal(result.planStatus, "planned");
  });

  it("uses the correct total-inventory ₱ (not the demo column-X bug)", () => {
    assert.equal(result.totals.totalInventoryPeso, expected.totalInventoryPeso);
  });

  it("matches every visible SKU MIL / alloc / Drop 1", () => {
    for (const [sku, lineExpected] of Object.entries(expected.lines)) {
      const line = result.lines.find((candidate) => candidate.sku === sku);
      assert.ok(line, `missing line ${sku}`);
      assert.equal(line.milQty, lineExpected.milQty, `${sku} milQty`);
      assert.equal(line.milPeso, lineExpected.milPeso, `${sku} milPeso`);
      assert.equal(line.allocQty, lineExpected.allocQty, `${sku} allocQty`);
      assert.equal(line.allocPeso, lineExpected.allocPeso, `${sku} allocPeso`);
      assert.equal(line.cycleQty, lineExpected.cycleQty, `${sku} cycleQty`);
      assert.equal(line.drop1Qty, lineExpected.drop1Qty, `${sku} drop1Qty`);
      assert.equal(line.drop1Peso, lineExpected.drop1Peso, `${sku} drop1Peso`);
    }
  });

  it("matches coverage DII (1 decimal) from FIG M1", () => {
    assert.equal(round1(result.coverage.historyDays), 16.1);
    assert.equal(round1(result.coverage.milDays), 9.1);
    assert.equal(round1(result.coverage.displayUnitsDays), 0.7);
    assert.equal(round1(result.coverage.onHandDays), 3.9);
    assert.equal(round1(result.coverage.forecastDays), 30.5);
    assert.equal(round1(result.coverage.allocationDays), 34.9);
    assert.equal(round1(result.coverage.drop1Days), 5.6);
    assert.equal(round1(result.coverage.totalInventoryDays), 44.2);
    assert.equal(round1(result.coverage.targetDays), 7.6);
  });

  it("keeps Free/bundle SKUs out of the value mix", () => {
    const free = result.lines.find((line) => line.sku === "SWS-01");
    assert.ok(free);
    assert.equal(free.hmix, 0);
    assert.equal(free.adjHmix, 0);
    assert.equal(free.onHandQty, 9);
    assert.equal(free.forecastPeso, 0);
  });
});

describe("computeDemandPlan — open-item defaults", () => {
  it("spills non-planogram mix onto planogram SKUs in the same series", () => {
    const skus: DemandPlanSkuInput[] = [
      {
        sku: "A-Y",
        series: "AA",
        srp: 100,
        planogramFlag: "Y",
        historyQty: 8,
        historyPeso: 80,
        displayUnits: 0,
        onHandQty: 0,
        forecastQty: 0,
      },
      {
        sku: "A-blank",
        series: "AA",
        srp: 100,
        planogramFlag: "blank",
        historyQty: 2,
        historyPeso: 20,
        displayUnits: 0,
        onHandQty: 0,
        forecastQty: 0,
      },
    ];
    const result = computeDemandPlan({
      parameters: {
        monthBasisDays: 30.5,
        dropsPerMonth: 1,
        roundUpToOne: false,
        floorAllocationAtZero: true,
        quotaMode: "branch_target",
        quotaPeso: 100,
      },
      skus,
    });
    const kept = result.lines.find((line) => line.sku === "A-Y");
    const spilled = result.lines.find((line) => line.sku === "A-blank");
    assert.ok(kept && spilled);
    assert.equal(kept.hmix, 0.8);
    assert.equal(kept.adjHmix, 1);
    assert.equal(spilled.adjHmix, 0);
    assert.equal(kept.milQty, 1);
    assert.equal(spilled.milQty, 0);
  });

  it("drops series spill when the series has no planogram SKUs", () => {
    const result = computeDemandPlan({
      parameters: {
        monthBasisDays: 30.5,
        dropsPerMonth: 1,
        roundUpToOne: false,
        floorAllocationAtZero: true,
        quotaMode: "branch_target",
        quotaPeso: 100,
      },
      skus: [
        {
          sku: "only-blank",
          series: "ZZ",
          srp: 100,
          planogramFlag: "blank",
          historyQty: 5,
          historyPeso: 100,
          displayUnits: 0,
          onHandQty: 0,
          forecastQty: 0,
        },
      ],
    });
    assert.equal(result.lines[0].adjHmix, 0);
    assert.equal(result.lines[0].milQty, 0);
    assert.equal(result.totals.allocQty, 0);
  });

  it("round-up-to-1 gives a facing when MIL would otherwise round to 0", () => {
    const sku: DemandPlanSkuInput = {
      sku: "slow",
      series: "SLOW",
      srp: 100_000,
      planogramFlag: "Y",
      historyQty: 0.3,
      historyPeso: 10,
      displayUnits: 0,
      onHandQty: 0,
      forecastQty: 0,
    };
    const withRule = computeDemandPlan({
      parameters: {
        monthBasisDays: 30.5,
        dropsPerMonth: 4,
        roundUpToOne: true,
        floorAllocationAtZero: true,
        quotaMode: "branch_target",
        quotaPeso: 10_000,
      },
      skus: [sku],
    });
    const withoutRule = computeDemandPlan({
      parameters: {
        monthBasisDays: 30.5,
        dropsPerMonth: 4,
        roundUpToOne: false,
        floorAllocationAtZero: true,
        quotaMode: "branch_target",
        quotaPeso: 10_000,
      },
      skus: [sku],
    });
    assert.equal(withRule.lines[0].milQty, 1);
    assert.equal(withoutRule.lines[0].milQty, 0);
  });
});
