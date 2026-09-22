import { resolvePagination, toPaginatedResult } from "@/lib/shared/pagination";

describe("resolvePagination", () => {
  it("defaults to page 1 with 25 rows", () => {
    expect(resolvePagination()).toEqual({ page: 1, limit: 25, skip: 0, take: 25 });
  });

  it("computes the offset from page and limit", () => {
    expect(resolvePagination({ page: 3, limit: 10 })).toEqual({ page: 3, limit: 10, skip: 20, take: 10 });
  });

  it("clamps page to a minimum of 1", () => {
    expect(resolvePagination({ page: 0 }).page).toBe(1);
    expect(resolvePagination({ page: -5 }).skip).toBe(0);
  });
});

describe("toPaginatedResult", () => {
  it("derives totalPages from total and limit", () => {
    const result = toPaginatedResult(["a", "b"], 42, 2, 20);
    expect(result).toMatchObject({ total: 42, page: 2, limit: 20, totalPages: 3 });
    expect(result.items).toEqual(["a", "b"]);
  });

  it("reports at least one page for an empty result", () => {
    expect(toPaginatedResult([], 0, 1, 25).totalPages).toBe(1);
  });
});
