import {
  isIsolatedSapTestCompany,
  newWarehouseSerialIds,
} from "@/features/inventory/services/warehouse-receive.rules";

describe("warehouse receive", () => {
  it("does not place a second copy of a serial already in the warehouse", () => {
    const first = newWarehouseSerialIds([], ["a", "b", "a"]);
    expect(first).toEqual(["a", "b"]);
    const second = newWarehouseSerialIds(["a", "b"], ["a", "b", "c"]);
    expect(second).toEqual(["c"]);
  });

  it("treats a duplicated business company as not an isolated test company", () => {
    expect(isIsolatedSapTestCompany("Duplicated_FindenNewDB")).toBe(false);
    expect(isIsolatedSapTestCompany("SBODEMOUS")).toBe(true);
    expect(isIsolatedSapTestCompany("FINDEN_TEST")).toBe(true);
  });
});
