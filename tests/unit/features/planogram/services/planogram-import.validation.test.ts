import { parsePlanogramShelfMax } from "@/features/planogram/services/planogram-import.validation";

describe("parsePlanogramShelfMax", () => {
  it("accepts whole numbers of at least 1, including commas and trailing .0", () => {
    expect(parsePlanogramShelfMax("1")).toEqual({ maxQty: 1 });
    expect(parsePlanogramShelfMax(" 12 ")).toEqual({ maxQty: 12 });
    expect(parsePlanogramShelfMax("1,000")).toEqual({ maxQty: 1000 });
    expect(parsePlanogramShelfMax("4.0")).toEqual({ maxQty: 4 });
  });

  it("rejects empty, zero, fractions, and non-numeric values", () => {
    expect(parsePlanogramShelfMax("")).toEqual({ error: "shelf_max is empty." });
    expect(parsePlanogramShelfMax("-")).toEqual({ error: "shelf_max is empty." });
    expect(parsePlanogramShelfMax("0")).toEqual({
      error: "shelf_max must be a whole number of at least 1.",
    });
    expect(parsePlanogramShelfMax("1.5")).toEqual({
      error: "shelf_max must be a whole number of at least 1.",
    });
    expect(parsePlanogramShelfMax("abc")).toEqual({
      error: "shelf_max must be a whole number of at least 1.",
    });
  });
});
