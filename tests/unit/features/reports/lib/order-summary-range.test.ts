import { orderSummaryRange } from "@/features/reports/lib/order-summary-range";

describe("orderSummaryRange", () => {
  // Wednesday 2026-11-04, 01:30 in Manila (still Nov 3 in UTC).
  const now = new Date("2026-11-03T17:30:00.000Z");

  it("uses the Manila calendar day for today and yesterday", () => {
    expect(orderSummaryRange("TODAY", now)).toEqual({ from: "2026-11-04", to: "2026-11-04" });
    expect(orderSummaryRange("YESTERDAY", now)).toEqual({ from: "2026-11-03", to: "2026-11-03" });
  });

  it("starts the week on Monday and the month on the 1st, up to today", () => {
    expect(orderSummaryRange("THIS_WEEK", now)).toEqual({ from: "2026-11-02", to: "2026-11-04" });
    expect(orderSummaryRange("THIS_MONTH", now)).toEqual({ from: "2026-11-01", to: "2026-11-04" });
  });

  it("treats Sunday as the end of its week and crosses month boundaries", () => {
    const sunday = new Date("2026-11-01T04:00:00.000Z");
    expect(orderSummaryRange("THIS_WEEK", sunday)).toEqual({ from: "2026-10-26", to: "2026-11-01" });
    expect(orderSummaryRange("YESTERDAY", sunday)).toEqual({ from: "2026-10-31", to: "2026-10-31" });
  });
});
