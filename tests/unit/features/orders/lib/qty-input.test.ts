import { parseQtyInput, qtyInputValue } from "@/features/orders/lib/qty-input";

describe("qty input", () => {
  it("shows 0 and unset as an empty field so typing replaces it", () => {
    expect(qtyInputValue(0)).toBe("");
    expect(qtyInputValue(null)).toBe("");
    expect(qtyInputValue(undefined)).toBe("");
    expect(qtyInputValue(5)).toBe(5);
  });

  it("reads an emptied field as 0 and keeps quantities whole and non-negative", () => {
    expect(parseQtyInput("")).toBe(0);
    expect(parseQtyInput("  ")).toBe(0);
    expect(parseQtyInput("05")).toBe(5);
    expect(parseQtyInput("12")).toBe(12);
    expect(parseQtyInput("3.7")).toBe(3);
    expect(parseQtyInput("-2")).toBe(0);
    expect(parseQtyInput("e")).toBe(0);
  });
});
