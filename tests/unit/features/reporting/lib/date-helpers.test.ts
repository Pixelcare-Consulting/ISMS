import { resolveDashboardPeriod } from "@/features/custom-dashboards/lib/dashboard-period";
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

describe("resolveDashboardPeriod", () => {
  it.each([
    ["TODAY", "2026-10-20", "2026-10-20"],
    ["YESTERDAY", "2026-10-19", "2026-10-19"],
    ["LAST_7_DAYS", "2026-10-14", "2026-10-20"],
    ["LAST_30_DAYS", "2026-09-21", "2026-10-20"],
    ["LAST_90_DAYS", "2026-07-23", "2026-10-20"],
    ["THIS_MONTH", "2026-10-01", "2026-10-20"],
    ["LAST_MONTH", "2026-09-01", "2026-09-30"],
    ["THIS_YEAR", "2026-01-01", "2026-10-20"],
  ] as const)("%s → %s to %s", (period, from, to) => {
    expect(resolveDashboardPeriod(period, "2026-10-20")).toEqual({ from, to });
  });

  it("crosses month and year boundaries", () => {
    expect(resolveDashboardPeriod("YESTERDAY", "2026-03-01")).toEqual({ from: "2026-02-28", to: "2026-02-28" });
    expect(resolveDashboardPeriod("LAST_MONTH", "2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(resolveDashboardPeriod("LAST_7_DAYS", "2026-01-03")).toEqual({ from: "2025-12-28", to: "2026-01-03" });
  });

  it("anchors today on Manila time, not UTC", () => {
    // 2026-10-19 20:00 UTC is already 2026-10-20 04:00 in Manila.
    jest.useFakeTimers({ now: new Date("2026-10-19T20:00:00Z") });
    try {
      expect(resolveDashboardPeriod("TODAY")).toEqual({ from: "2026-10-20", to: "2026-10-20" });
    } finally {
      jest.useRealTimers();
    }
  });
});
