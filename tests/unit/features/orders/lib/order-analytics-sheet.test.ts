import {
  analyticsLineSuggest,
  analyticsMetricStrip,
  analyticsSuggestHelp,
} from "@/features/orders/lib/order-analytics-sheet";
import { NO_PLANNING_SUGGESTION_MESSAGE } from "@/features/orders/lib/order-worksheet-metrics";

describe("analyticsLineSuggest", () => {
  it("keeps the shelf gap for manual and special orders", () => {
    expect(
      analyticsLineSuggest({ orderType: "manual", shelfGapQty: 3, planQty: 9 }),
    ).toEqual({ kind: "qty", qty: 3 });
    expect(analyticsLineSuggest({ orderType: "special", shelfGapQty: 2 })).toEqual({
      kind: "qty",
      qty: 2,
    });
    expect(analyticsSuggestHelp("manual")).toMatch(/Shelf gap/);
    expect(analyticsSuggestHelp("special")).toMatch(/Shelf gap/);
  });

  it("uses the released plan for auto replenish", () => {
    expect(
      analyticsLineSuggest({
        orderType: "auto_replenish",
        shelfGapQty: 8,
        planQty: 4,
        planUnavailable: false,
      }),
    ).toEqual({ kind: "qty", qty: 4 });
    expect(
      analyticsLineSuggest({
        orderType: "auto_replenish",
        shelfGapQty: 8,
        planQty: null,
        planUnavailable: true,
      }),
    ).toEqual({ kind: "unavailable", message: NO_PLANNING_SUGGESTION_MESSAGE });
    expect(analyticsSuggestHelp("auto_replenish")).toMatch(/released plan/);
  });
});

describe("analyticsMetricStrip", () => {
  it("turns on-hand value and sales into days of cover", () => {
    const strip = analyticsMetricStrip(
      [
        {
          stkQty: 10,
          ditQty: 2,
          srp: 100,
          salesAmount: 500,
          salesQty: 5,
          milQty: 4,
          milDays: 30,
        },
      ],
      10,
    );
    expect(strip.inventoryAmount).toBe(1000);
    expect(strip.stkCount).toBe(10);
    expect(strip.ditCount).toBe(2);
    expect(strip.salesQty).toBe(5);
    expect(strip.computedDii).toBe(20);
    expect(strip.targetDays).toBe(30);
  });
});
