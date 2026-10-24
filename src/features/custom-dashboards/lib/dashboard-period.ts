import type { CustomDashboardPeriod } from "@/features/custom-dashboards/schemas/custom-dashboard.schema";
import { manilaTodayIso } from "@/features/orders/utils/manila-calendar";

export interface DashboardRange {
  from: string;
  to: string;
}

/** Date-only arithmetic in UTC so no local timezone can shift the day. */
function isoDay(year: number, monthIndex: number, day: number): string {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
}

function lastDays(year: number, monthIndex: number, day: number, count: number): DashboardRange {
  return { from: isoDay(year, monthIndex, day - (count - 1)), to: isoDay(year, monthIndex, day) };
}

/**
 * Resolves a rolling period to inclusive YYYY-MM-DD dates, anchored on
 * today's date in Manila (the business calendar the datasets use).
 */
export function resolveDashboardPeriod(period: CustomDashboardPeriod, today: string = manilaTodayIso()): DashboardRange {
  const [year, month, day] = today.split("-").map(Number);
  const m = month - 1;
  switch (period) {
    case "TODAY":
      return { from: today, to: today };
    case "YESTERDAY": {
      const yesterday = isoDay(year, m, day - 1);
      return { from: yesterday, to: yesterday };
    }
    case "LAST_7_DAYS":
      return lastDays(year, m, day, 7);
    case "LAST_30_DAYS":
      return lastDays(year, m, day, 30);
    case "LAST_90_DAYS":
      return lastDays(year, m, day, 90);
    case "THIS_MONTH":
      return { from: isoDay(year, m, 1), to: today };
    case "LAST_MONTH":
      // Day 0 of this month is the last day of the previous one.
      return { from: isoDay(year, m - 1, 1), to: isoDay(year, m, 0) };
    case "THIS_YEAR":
      return { from: isoDay(year, 0, 1), to: today };
  }
}
