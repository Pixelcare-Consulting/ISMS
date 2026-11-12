import {
  branchInventoryUnitTotal,
  omitBranchInventoryV2HiddenStatusCounts,
} from "@/features/inventory/utils/branch-inventory-v2";
import {
  resolveInventoryCardUnitPrice,
  sumBranchInventoryV2CardAmounts,
  type BranchInventoryV2CardPriceRow,
} from "@/features/inventory/utils/branch-inventory-v2-card-amounts";
import type { InventoryGroupAggregates } from "@/features/inventory/utils/stock-units-group-aggregates";

const TODAY = "2026-11-12";

function price(
  modelId: string,
  amount: number,
  periodStart: string,
  periodEnd: string,
  packageTypeId: string | null = null,
): BranchInventoryV2CardPriceRow {
  return { modelId, amount, periodStart, periodEnd, packageTypeId };
}

describe("resolveInventoryCardUnitPrice", () => {
  it("uses the active general price instead of a package price", () => {
    expect(
      resolveInventoryCardUnitPrice(
        [
          price("m", 9000, "2026-11-01", "2026-11-30", "pkg"),
          price("m", 10000, "2026-10-01", "2026-11-30"),
        ],
        5000,
        TODAY,
      ),
    ).toBe(10000);
  });

  it("uses the latest started general price when nothing is active today", () => {
    expect(
      resolveInventoryCardUnitPrice(
        [
          price("m", 8000, "2026-01-01", "2026-06-30"),
          price("m", 8500, "2026-07-01", "2026-10-31"),
          price("m", 9900, "2026-08-01", "2026-10-31", "pkg"),
        ],
        5000,
        TODAY,
      ),
    ).toBe(8500);
  });

  it("falls back to SRP when the model has no usable price list", () => {
    expect(
      resolveInventoryCardUnitPrice(
        [price("m", 15000, "2026-12-01", "2026-12-31")],
        1200,
        TODAY,
      ),
    ).toBe(1200);
  });

  it("is zero when the model has neither a price list nor an SRP", () => {
    expect(resolveInventoryCardUnitPrice([], null, TODAY)).toBe(0);
  });

  it("keeps a listed price of zero instead of replacing it with SRP", () => {
    expect(
      resolveInventoryCardUnitPrice(
        [price("m", 0, "2026-11-01", "2026-11-30")],
        500,
        TODAY,
      ),
    ).toBe(0);
  });
});

describe("sumBranchInventoryV2CardAmounts", () => {
  it("prices each card from its own quantity and leaves sold units out of the rows", () => {
    const amounts = sumBranchInventoryV2CardAmounts(
      [
        {
          modelId: "priced",
          srp: 100,
          totalQty: 4,
          inStockQty: 2,
          defectiveQty: 1,
          offPlanogramQty: 3,
        },
        {
          modelId: "srp-only",
          srp: 50,
          totalQty: 2,
          inStockQty: 2,
          defectiveQty: 0,
          offPlanogramQty: 0,
        },
        {
          modelId: "unpriced",
          srp: null,
          totalQty: 5,
          inStockQty: 5,
          defectiveQty: 0,
          offPlanogramQty: 1,
        },
      ],
      [price("priced", 1000, "2026-11-01", "2026-11-30")],
      TODAY,
    );

    expect(amounts).toEqual({
      total: 4100,
      inStock: 2100,
      defective: 1000,
      offPlanogram: 3000,
    });
  });
});

describe("omitBranchInventoryV2HiddenStatusCounts", () => {
  it("drops Sold and Official Sold so the unit total matches the remaining columns", () => {
    const counts: InventoryGroupAggregates = {
      total: 9,
      available: 3,
      defective: 1,
      reserved: 0,
      pendingInspection: 0,
      notStockedIn: 1,
      statusCounts: { STK: 3, SLD: 4, OFS: 2, DEF: 1, sld: 1 },
      statuses: [
        { code: "STK", name: "Stock", color: "emerald", count: 3 },
        { code: "SLD", name: "Sold", color: "slate", count: 4 },
        { code: "OFS", name: "Official Sold", color: "teal", count: 2 },
        { code: "DEF", name: "Defective", color: "rose", count: 1 },
        { code: "sld", name: "Sold", color: null, count: 1 },
      ],
    };

    const visible = omitBranchInventoryV2HiddenStatusCounts(counts);

    expect(visible.statuses.map((status) => status.code)).toEqual(["STK", "DEF"]);
    expect(visible.statusCounts).toEqual({ STK: 3, DEF: 1 });
    expect(branchInventoryUnitTotal(visible)).toBe(5);
  });
});
