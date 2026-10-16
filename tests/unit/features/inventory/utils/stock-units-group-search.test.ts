import {
  normalizeStockUnitsGroupSearch,
  stockUnitsGroupSearchPattern,
} from "@/features/inventory/utils/stock-units-group-search";

describe("stock units group search", () => {
  it("returns undefined for blank queries", () => {
    expect(normalizeStockUnitsGroupSearch("  ")).toBeUndefined();
    expect(stockUnitsGroupSearchPattern(undefined)).toBeUndefined();
  });

  it("builds an ILIKE pattern with wildcards escaped", () => {
    expect(stockUnitsGroupSearchPattern("  ABC-123  ")).toBe("%ABC-123%");
    expect(stockUnitsGroupSearchPattern("100%_off")).toBe("%100\\%\\_off%");
  });

  it("escapes backslashes so they cannot act as LIKE escape characters", () => {
    expect(stockUnitsGroupSearchPattern("A\\B")).toBe("%A\\\\B%");
    expect(stockUnitsGroupSearchPattern("\\%")).toBe("%\\\\\\%%");
  });
});
