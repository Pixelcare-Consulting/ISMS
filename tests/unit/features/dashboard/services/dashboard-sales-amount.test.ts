import {
  dashboardSaleLineAmount,
  rankTopBranchesByDashboardSaleAmount,
  sumDashboardSaleAmounts,
} from "@/features/dashboard/services/dashboard-sales-amount";

describe("dashboardSaleLineAmount", () => {
  it("uses the price-list model amount when it is set", () => {
    expect(
      dashboardSaleLineAmount({
        modelPrice: 89000,
        saleAmount: 12000,
        amount: 5000,
      }),
    ).toBe(89000);
  });

  it("keeps an explicit zero model price", () => {
    expect(
      dashboardSaleLineAmount({
        modelPrice: 0,
        saleAmount: 15000,
        amount: 15000,
      }),
    ).toBe(0);
  });

  it("falls back to sale amount when model price is missing", () => {
    expect(
      dashboardSaleLineAmount({
        modelPrice: null,
        saleAmount: 15000,
        amount: 9000,
      }),
    ).toBe(15000);
  });

  it("falls back to amount when model price and sale amount are missing", () => {
    expect(
      dashboardSaleLineAmount({
        modelPrice: null,
        saleAmount: null,
        amount: 6400.5,
      }),
    ).toBe(6400.5);
  });

  it("reads decimal-like values from their string form", () => {
    expect(
      dashboardSaleLineAmount({
        modelPrice: { toString: () => "12345.67" },
        saleAmount: 1,
        amount: 1,
      }),
    ).toBe(12345.67);
  });
});

describe("sumDashboardSaleAmounts", () => {
  it("sums model prices and keeps older lines that only have a sale amount", () => {
    expect(
      sumDashboardSaleAmounts([
        { modelPrice: 89000, saleAmount: 10000, amount: 10000 },
        { modelPrice: null, saleAmount: 15000, amount: 9000 },
        { modelPrice: null, saleAmount: null, amount: 2500.25 },
        { modelPrice: 0, saleAmount: 4000, amount: 4000 },
      ]),
    ).toBe(106500.25);
  });
});

describe("rankTopBranchesByDashboardSaleAmount", () => {
  it("ranks branches by the same model amount as the month sale total", () => {
    const lines = [
      {
        branchId: "north",
        branchName: "North",
        modelPrice: 10000,
        saleAmount: 1,
        amount: 1,
      },
      {
        branchId: "north",
        branchName: "North",
        modelPrice: null,
        saleAmount: 5000,
        amount: 1,
      },
      {
        branchId: "south",
        branchName: "South",
        modelPrice: 20000,
        saleAmount: 1,
        amount: 1,
      },
      {
        branchId: "east",
        branchName: "East",
        modelPrice: null,
        saleAmount: null,
        amount: 15000,
      },
    ];

    expect(rankTopBranchesByDashboardSaleAmount(lines)).toEqual([
      { id: "south", name: "South", value: 20000 },
      { id: "east", name: "East", value: 15000 },
      { id: "north", name: "North", value: 15000 },
    ]);
    expect(sumDashboardSaleAmounts(lines)).toBe(50000);
  });

  it("keeps the five highest branches and breaks ties by name", () => {
    const lines = ["F", "E", "D", "C", "B", "A"].map((name, index) => ({
      branchId: name,
      branchName: name,
      modelPrice: index < 2 ? 100 : 50,
      saleAmount: null,
      amount: null,
    }));

    expect(rankTopBranchesByDashboardSaleAmount(lines).map((row) => row.name)).toEqual([
      "E",
      "F",
      "A",
      "B",
      "C",
    ]);
  });

  it("labels a blank branch name", () => {
    expect(
      rankTopBranchesByDashboardSaleAmount([
        {
          branchId: "missing",
          branchName: "  ",
          modelPrice: 10,
          saleAmount: null,
          amount: null,
        },
      ]),
    ).toEqual([{ id: "missing", name: "Unknown branch", value: 10 }]);
  });
});
