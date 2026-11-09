import {
  describeTransactionDateWindow,
  salesTransactionDateWindow,
  transactionDateWindowError,
} from "@/features/sales/utils/transaction-date-window";

// 2026-11-09 08:30 in Manila (UTC+8).
const NOW = new Date("2026-11-09T00:30:00.000Z");

describe("salesTransactionDateWindow", () => {
  it("runs from N days back to today in Manila", () => {
    expect(salesTransactionDateWindow(7, NOW)).toEqual({
      min: "2026-11-02",
      max: "2026-11-09",
      backdateDays: 7,
    });
  });

  it("uses the Manila day, not UTC, near midnight", () => {
    // 2026-11-08 16:30 UTC is already 2026-11-09 00:30 in Manila.
    const window = salesTransactionDateWindow(0, new Date("2026-11-08T16:30:00.000Z"));
    expect(window).toEqual({ min: "2026-11-09", max: "2026-11-09", backdateDays: 0 });
  });

  it("crosses month and year boundaries", () => {
    const window = salesTransactionDateWindow(3, new Date("2027-01-01T04:00:00.000Z"));
    expect(window.min).toBe("2026-12-29");
  });

  it("clamps out-of-range settings", () => {
    expect(salesTransactionDateWindow(-5, NOW).backdateDays).toBe(0);
    expect(salesTransactionDateWindow(9999, NOW).backdateDays).toBe(365);
  });
});

describe("transactionDateWindowError", () => {
  const window = salesTransactionDateWindow(7, NOW);

  it("requires a date", () => {
    expect(transactionDateWindowError("", window)).toBe("Transaction date is required");
    expect(transactionDateWindowError(undefined, window)).toBe("Transaction date is required");
  });

  it("accepts the edges of the window", () => {
    expect(transactionDateWindowError("2026-11-02", window)).toBeNull();
    expect(transactionDateWindowError("2026-11-09", window)).toBeNull();
  });

  it("rejects dates before the window and future dates", () => {
    expect(transactionDateWindowError("2026-11-01", window)).toMatch(/outside the allowed range/);
    expect(transactionDateWindowError("2026-11-10", window)).toMatch(/outside the allowed range/);
  });

  it("rejects malformed values", () => {
    expect(transactionDateWindowError("11/09/2026", window)).toBe("Invalid transaction date");
  });
});

describe("describeTransactionDateWindow", () => {
  it("explains a today-only rule", () => {
    expect(describeTransactionDateWindow(salesTransactionDateWindow(0, NOW))).toBe(
      "Only today can be selected.",
    );
  });

  it("lists the range", () => {
    expect(describeTransactionDateWindow(salesTransactionDateWindow(1, NOW))).toBe(
      "Today or up to 1 day back (2026-11-08 to 2026-11-09).",
    );
  });
});
