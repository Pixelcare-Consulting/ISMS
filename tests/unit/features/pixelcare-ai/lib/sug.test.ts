import { computeSugQty } from "@/features/pixelcare-ai/lib/sug";

describe("computeSugQty", () => {
  it("matches order-analytics shelf gap Math.max(0, Shelf max - STK)", () => {
    expect(computeSugQty(6, 4)).toBe(2);
    expect(computeSugQty(3, 3)).toBe(0);
    expect(computeSugQty(2, 5)).toBe(0);
    expect(computeSugQty(0, 0)).toBe(0);
  });
});
