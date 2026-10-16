import { filterStatusCodesForStockUnitsDropdown } from "@/features/inventory/utils/stock-units-status-dropdown";

describe("filterStatusCodesForStockUnitsDropdown", () => {
  it("omits DEF so defective status uses the inspection workflow", () => {
    const codes = [
      { id: "1", code: "STK", name: "Stock" },
      { id: "2", code: "DEF", name: "Defective" },
      { id: "3", code: "RSV", name: "Reserved" },
    ];

    expect(filterStatusCodesForStockUnitsDropdown(codes)).toEqual([
      { id: "1", code: "STK", name: "Stock" },
      { id: "3", code: "RSV", name: "Reserved" },
    ]);
  });
});
