import { resolveSaleTransactionDate } from "@/features/sales/utils/transaction-date";

const now = new Date("2026-11-13T04:00:00.000Z");

describe("resolveSaleTransactionDate", () => {
  it("leaves a blank date empty", () => {
    expect(resolveSaleTransactionDate(undefined, null, now)).toEqual({ date: null });
    expect(resolveSaleTransactionDate("  ", null, now)).toEqual({ date: null });
  });

  it("accepts today and a future Manila calendar date", () => {
    expect(resolveSaleTransactionDate("2026-11-13", null, now)).toEqual({
      date: new Date("2026-11-13T00:00:00.000Z"),
    });
    expect(resolveSaleTransactionDate("2026-11-20", null, now)).toEqual({
      date: new Date("2026-11-20T00:00:00.000Z"),
    });
  });

  it("rejects a Manila calendar date before today", () => {
    expect(resolveSaleTransactionDate("2026-11-12", null, now)).toEqual({
      error: "Transaction date cannot be before today",
    });
  });

  it("keeps an existing past date unless a different past date is chosen", () => {
    expect(resolveSaleTransactionDate("2026-01-01", "2026-01-01", now)).toEqual({
      date: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(resolveSaleTransactionDate("2026-01-02", "2026-01-01", now)).toEqual({
      error: "Transaction date cannot be before today",
    });
  });

  it("rejects a date that is not a real calendar day", () => {
    expect(resolveSaleTransactionDate("2026-02-31", null, now)).toEqual({
      error: "Invalid transaction date",
    });
  });
});
