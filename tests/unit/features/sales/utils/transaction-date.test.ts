import { resolveSaleTransactionDate } from "@/features/sales/utils/transaction-date";

const now = new Date("2026-11-13T04:00:00.000Z");

describe("resolveSaleTransactionDate", () => {
  it("leaves a blank date empty", () => {
    expect(resolveSaleTransactionDate(undefined, null, now)).toEqual({ date: null });
    expect(resolveSaleTransactionDate("  ", null, now)).toEqual({ date: null });
  });

  it("accepts today, a future date, and a Manila date 15 or 30 days ago", () => {
    expect(resolveSaleTransactionDate("2026-11-13", null, now)).toEqual({
      date: new Date("2026-11-13T00:00:00.000Z"),
    });
    expect(resolveSaleTransactionDate("2026-11-20", null, now)).toEqual({
      date: new Date("2026-11-20T00:00:00.000Z"),
    });
    expect(resolveSaleTransactionDate("2026-10-29", null, now)).toEqual({
      date: new Date("2026-10-29T00:00:00.000Z"),
    });
    expect(resolveSaleTransactionDate("2026-10-14", null, now)).toEqual({
      date: new Date("2026-10-14T00:00:00.000Z"),
    });
  });

  it("rejects a Manila calendar date more than 30 days before today", () => {
    expect(resolveSaleTransactionDate("2026-10-13", null, now)).toEqual({
      error: "Transaction date cannot be more than 30 days before today",
    });
  });

  it("keeps an existing older date and still allows a different date inside the window", () => {
    expect(resolveSaleTransactionDate("2026-01-01", "2026-01-01", now)).toEqual({
      date: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(resolveSaleTransactionDate("2026-10-29", "2026-01-01", now)).toEqual({
      date: new Date("2026-10-29T00:00:00.000Z"),
    });
    expect(resolveSaleTransactionDate("2026-01-02", "2026-01-01", now)).toEqual({
      error: "Transaction date cannot be more than 30 days before today",
    });
  });

  it("rejects a date that is not a real calendar day", () => {
    expect(resolveSaleTransactionDate("2026-02-31", null, now)).toEqual({
      error: "Invalid transaction date",
    });
  });
});
