/**
 * 3-month sales history window immediately before a planning period (UTC month bounds).
 */

export const HISTORY_MONTHS = 3;

export function threeMonthHistoryWindow(periodStart: Date): {
  historyFrom: Date;
  historyTo: Date;
} {
  const start = new Date(
    Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth(), 1, 0, 0, 0, 0),
  );
  const historyFrom = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - HISTORY_MONTHS, 1, 0, 0, 0, 0),
  );
  const historyTo = new Date(start.getTime() - 1);
  return { historyFrom, historyTo };
}

export function averageOverHistoryMonths(total: number): number {
  if (!Number.isFinite(total)) return 0;
  return total / HISTORY_MONTHS;
}

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Display label for the rolling history window, e.g. `Sep – Nov 2025 (3 mo)`. */
export function formatHistoryWindowLabel(periodStart: Date): string {
  const { historyFrom, historyTo } = threeMonthHistoryWindow(periodStart);
  const fromMonth = SHORT_MONTHS[historyFrom.getUTCMonth()] ?? "";
  const toMonth = SHORT_MONTHS[historyTo.getUTCMonth()] ?? "";
  const fromYear = historyFrom.getUTCFullYear();
  const toYear = historyTo.getUTCFullYear();
  const span =
    fromYear === toYear
      ? `${fromMonth} – ${toMonth} ${toYear}`
      : `${fromMonth} ${fromYear} – ${toMonth} ${toYear}`;
  return `${span} (${HISTORY_MONTHS} mo)`;
}
