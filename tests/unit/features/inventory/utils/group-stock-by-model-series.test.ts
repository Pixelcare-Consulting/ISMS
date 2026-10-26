import { groupStockByModelSeries } from "@/features/inventory/utils/group-stock-by-model-series";

describe("groupStockByModelSeries", () => {
  it("moves quantity into the series saved on the model", () => {
    const before = groupStockByModelSeries([
      { seriesName: "50QUHW", srp: 22950, qty: 1 },
      { seriesName: "55QUHW", srp: 25000, qty: 10 },
    ]);
    expect(before.rows).toEqual([
      { series: "50QUHW", qty: 1, value: 22950 },
      { series: "55QUHW", qty: 10, value: 250000 },
    ]);

    const after = groupStockByModelSeries([
      { seriesName: "55QUHW", srp: 22950, qty: 1 },
      { seriesName: "55QUHW", srp: 25000, qty: 10 },
    ]);
    expect(after.rows.map((row) => row.series)).not.toContain("50QUHW");
    expect(after.rows).toEqual([{ series: "55QUHW", qty: 11, value: 272950 }]);
    expect(after.totalQty).toBe(11);
    expect(after.totalValue).toBe(272950);
  });

  it("does not turn a SKU prefix such as SWS- into a series", () => {
    const summary = groupStockByModelSeries([
      { seriesName: null, srp: 0, qty: 2 },
      { seriesName: "   ", srp: 100, qty: 2 },
    ]);

    expect(summary.rows.map((row) => row.series)).toEqual(["—"]);
    expect(summary.rows[0]).toEqual({ series: "—", qty: 4, value: 200 });
    expect(summary.rows.some((row) => row.series === "SWS-")).toBe(false);
    expect(summary.rows.some((row) => row.series === "TEST-TV-")).toBe(false);
  });

  it("keeps the master-data series when it differs from the SKU stem", () => {
    const summary = groupStockByModelSeries([
      { seriesName: "43UHD", srp: 80000, qty: 3 },
    ]);

    expect(summary.rows).toEqual([{ series: "43UHD", qty: 3, value: 240000 }]);
  });
});
