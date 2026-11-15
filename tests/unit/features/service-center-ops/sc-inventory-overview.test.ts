import {
  buildScInventoryOverview,
  scInventoryAgingDays,
  scInventoryModelOptions,
  scInventoryStatuses,
  type ScInventoryAggregateRow,
} from "@/features/service-center-ops/lib/sc-inventory-overview";

const row = (overrides: Partial<ScInventoryAggregateRow>): ScInventoryAggregateRow => ({
  serviceCenterId: "sc1",
  centerName: "North SC",
  centerSapCode: "SC-N",
  modelId: "m1",
  skuCode: "TV-55",
  modelName: "55 inch TV",
  srp: 1000,
  seriesName: "Vision",
  statusCode: "STK",
  qty: 1,
  ...overrides,
});

const TODAY = "2026-11-15";

describe("buildScInventoryOverview", () => {
  const rows = [
    row({ qty: 3 }),
    row({ statusCode: "DEF", qty: 2 }),
    row({ statusCode: "DIT", qty: 1, modelId: "m2", skuCode: "AC-1", srp: 500, seriesName: null }),
    row({ serviceCenterId: "sc2", centerName: "East SC", centerSapCode: "SC-E", statusCode: "DEF", qty: 4 }),
  ];

  it("counts units per center and status, sorted by center name", () => {
    const overview = buildScInventoryOverview(rows, [], [], TODAY);
    expect(overview.centers.map((center) => [center.center.name, center.total, center.statusCounts])).toEqual([
      ["East SC", 4, { DEF: 4 }],
      ["North SC", 6, { STK: 3, DEF: 2, DIT: 1 }],
    ]);
    expect(overview.topDefectiveCenter).toBe("East SC");
  });

  it("values the cards at SRP when no price list applies", () => {
    const { cards } = buildScInventoryOverview(rows, [], [], TODAY);
    expect(cards).toEqual({
      total: { qty: 10, amount: 9500 },
      inStock: { qty: 3, amount: 3000 },
      defective: { qty: 6, amount: 6000 },
      inTransit: { qty: 1, amount: 500 },
    });
  });

  it("prefers the active price list over SRP", () => {
    const price = { modelId: "m1", amount: 800, periodStart: "2026-01-01", periodEnd: "2026-12-31", packageTypeId: null };
    expect(buildScInventoryOverview([row({ qty: 2 })], [price], [], TODAY).cards.total.amount).toBe(1600);
  });

  it("lists a covered center with no units", () => {
    const overview = buildScInventoryOverview([], [], [{ id: "sc3", name: "Empty SC", sapCode: "SC-X" }], TODAY);
    expect(overview.centers).toEqual([
      { center: { id: "sc3", name: "Empty SC", sapCode: "SC-X" }, total: 0, statusCounts: {} },
    ]);
    expect(overview.topDefectiveCenter).toBeNull();
  });

  it("rolls the series panel up by series at SRP", () => {
    const { seriesSummary } = buildScInventoryOverview(rows, [], [], TODAY);
    expect(seriesSummary.totalQty).toBe(10);
    expect(seriesSummary.rows).toEqual([
      { series: "Vision", qty: 9, value: 9000 },
      { series: "—", qty: 1, value: 500 },
    ].sort((a, b) => a.series.localeCompare(b.series)));
  });
});

describe("scInventoryStatuses", () => {
  const options = [
    { code: "STK", name: "In stock", color: "green" },
    { code: "DIT", name: "In transit", color: null },
    { code: "DEF", name: "Defective", color: "red" },
  ];

  it("keeps the tenant's order and only statuses with units", () => {
    expect(scInventoryStatuses(options, [row({ statusCode: "DEF", qty: 2 }), row({ qty: 1 })])).toEqual([
      { code: "STK", name: "In stock", color: "green", count: 1 },
      { code: "DEF", name: "Defective", color: "red", count: 2 },
    ]);
  });

  it("still shows a code that is not in the active list", () => {
    expect(scInventoryStatuses(options, [row({ statusCode: "RSV" })])).toEqual([
      { code: "RSV", name: "RSV", color: null, count: 1 },
    ]);
  });
});

describe("scInventoryModelOptions", () => {
  it("lists each model once, by SKU", () => {
    expect(
      scInventoryModelOptions([row({ skuCode: "TV-55" }), row({ skuCode: "AC-1", modelName: "Aircon" }), row({ skuCode: "TV-55", statusCode: "DEF" })]),
    ).toEqual([
      { sku: "AC-1", name: "Aircon" },
      { sku: "TV-55", name: "55 inch TV" },
    ]);
  });
});

describe("scInventoryAgingDays", () => {
  const now = new Date("2026-11-15T00:00:00Z");

  it("counts from the DR date, else from when the unit was placed", () => {
    expect(scInventoryAgingDays(new Date("2026-11-05T00:00:00Z"), new Date("2026-11-14T00:00:00Z"), now)).toBe(10);
    expect(scInventoryAgingDays(null, new Date("2026-11-14T00:00:00Z"), now)).toBe(1);
  });

  it("never goes below zero", () => {
    expect(scInventoryAgingDays(new Date("2026-11-20T00:00:00Z"), now, now)).toBe(0);
  });
});
