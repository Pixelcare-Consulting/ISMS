import {
  inventoryGroupAggregatesFromParts,
  inventoryGroupAggregatesFromSqlRow,
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
      total: 13,
    });
  });
});
