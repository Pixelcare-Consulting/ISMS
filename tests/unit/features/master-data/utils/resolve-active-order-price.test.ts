import { resolveActiveOrderPrice } from "@/features/master-data/utils/resolve-active-order-price";

const TODAY = "2026-10-16";

describe("resolveActiveOrderPrice", () => {
  it("returns 90000 when only a SOLO row is active", () => {
    expect(
      resolveActiveOrderPrice(
        [
          {
            amount: 90000,
            periodStart: "2026-10-16",
            periodEnd: "2026-10-31",
            packageTypeId: "solo",
          },
        ],
        0,
        TODAY,
      ),
    ).toBe(90000);
  });

  it("prefers an active general row over an active SOLO row", () => {
    expect(
      resolveActiveOrderPrice(
        [
          {
            amount: 90000,
            periodStart: "2026-10-16",
            periodEnd: "2026-10-31",
            packageTypeId: "solo",
          },
          {
            amount: 75000,
            periodStart: "2026-10-01",
            periodEnd: "2026-10-31",
            packageTypeId: null,
          },
        ],
        0,
        TODAY,
      ),
    ).toBe(75000);
  });

  it("falls back to model SRP, including 0, when no row is active today", () => {
    const expiredSolo = [
      {
        amount: 90000,
        periodStart: "2026-09-01",
        periodEnd: "2026-09-30",
        packageTypeId: "solo",
      },
    ];

    expect(resolveActiveOrderPrice(expiredSolo, 12000, TODAY)).toBe(12000);
    expect(resolveActiveOrderPrice(expiredSolo, 0, TODAY)).toBe(0);
    expect(resolveActiveOrderPrice([], null, TODAY)).toBe(0);
  });
});
