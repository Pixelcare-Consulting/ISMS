import { defaultDashboardRange } from "@/features/custom-dashboards/lib/default-range";
import { describeDateRange } from "@/features/reporting/lib/filter-summary";

describe("describeDateRange", () => {
  it.each([
    [undefined, undefined, "All dates"],
    ["2026-10-01", undefined, "From 2026-10-01"],
    [undefined, "2026-10-19", "Up to 2026-10-19"],
    ["2026-10-01", "2026-10-19", "2026-10-01 to 2026-10-19"],
  ])("%s / %s → %s", (from, to, expected) => {
    expect(describeDateRange(from, to)).toBe(expected);
  });
});

describe("defaultDashboardRange", () => {
  it("covers the last 30 days inclusive", () => {
    expect(defaultDashboardRange(new Date("2026-10-19T08:00:00Z"))).toEqual({ from: "2026-09-20", to: "2026-10-19" });
  });
});
