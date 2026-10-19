import {
  inventoryGroupAggregatesFromParts,
  inventoryGroupAggregatesFromSqlRow,
  inventoryGroupStatusesFromCounts,
  visibleInventoryGroupStatuses,
} from "@/features/inventory/utils/stock-units-group-aggregates";

describe("stock units group aggregates", () => {
  it("splits STK into available and pending inspection", () => {
    expect(
      inventoryGroupAggregatesFromParts({
        stk: 10,
        def: 2,
        rsv: 1,
        pendingInspection: 3,
      }),
    ).toEqual({
      available: 7,
      defective: 2,
      reserved: 1,
      pendingInspection: 3,
      statusCounts: {},
      total: 13,
    });
  });

  it("matches SQL net STK row totals to raw STK minus pending", () => {
    const rawStk = 10;
    const pending = 3;
    const def = 2;
    const rsv = 1;

    const fromParts = inventoryGroupAggregatesFromParts({
      stk: rawStk,
      def,
      rsv,
      pendingInspection: pending,
    });
    const fromSql = inventoryGroupAggregatesFromSqlRow({
      stk: rawStk - pending,
      def,
      rsv,
      pending_inspection: pending,
    });

    expect(fromSql).toEqual(fromParts);
  });

  it("maps SQL aggregate columns without double-subtracting pending", () => {
    expect(
      inventoryGroupAggregatesFromSqlRow({
        stk: 7,
        def: 2,
        rsv: 1,
        pending_inspection: 3,
      }),
    ).toEqual({
      available: 7,
      defective: 2,
      reserved: 1,
      pendingInspection: 3,
      statusCounts: {},
      total: 13,
    });
  });

  it("keeps full status counts, including zeros, separate from net STK", () => {
    expect(
      inventoryGroupAggregatesFromSqlRow({
        stk: 7,
        def: 2,
        rsv: 0,
        pending_inspection: 3,
        status_counts: { STK: 10, DEF: 2, DIT: 1, SLD: 0, FW: 4 },
      }).statusCounts,
    ).toEqual({ STK: 10, DEF: 2, DIT: 1, SLD: 0, FW: 4 });
  });

  it("keeps zero counts in the payload and hides them from row chips", () => {
    const statuses = inventoryGroupStatusesFromCounts(
      [
        { code: "DIT", name: "Delivery in transit", color: "sky" },
        { code: "STK", name: "Stock", color: "emerald" },
        { code: "SLD", name: "Sold", color: "slate" },
        { code: "DEF", name: "Defective", color: "rose" },
        { code: "FW", name: "TO FOLLOW", color: "orange" },
      ],
      { DIT: 1, DEF: 2 },
    );

    expect(statuses.map((status) => status.count)).toEqual([1, 0, 0, 2, 0]);
    expect(visibleInventoryGroupStatuses(statuses)).toEqual([
      { code: "DIT", name: "Delivery in transit", color: "sky", count: 1 },
      { code: "DEF", name: "Defective", color: "rose", count: 2 },
    ]);
  });

  it("shows no status chips when every count is zero", () => {
    expect(
      visibleInventoryGroupStatuses([
        { code: "STK", name: "Stock", color: "emerald", count: 0 },
        { code: "DEF", name: "Defective", color: "rose", count: 0 },
      ]),
    ).toEqual([]);
  });
});
