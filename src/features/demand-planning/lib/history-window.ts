/**
 * Sales history window immediately before a planning period (UTC month bounds).
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

/** Inclusive calendar-month count between two UTC dates (min 1). */
export function historyMonthSpan(historyFrom: Date, historyTo: Date): number {
  if (!(historyFrom instanceof Date) || !(historyTo instanceof Date)) return HISTORY_MONTHS;
  if (Number.isNaN(historyFrom.getTime()) || Number.isNaN(historyTo.getTime())) {
    return HISTORY_MONTHS;
  }
  const fromY = historyFrom.getUTCFullYear();
  const fromM = historyFrom.getUTCMonth();
  const toY = historyTo.getUTCFullYear();
  const toM = historyTo.getUTCMonth();
  const span = (toY - fromY) * 12 + (toM - fromM) + 1;
  return Math.max(1, span);
}

export function averageOverHistoryMonths(
  total: number,
  months: number = HISTORY_MONTHS,
): number {
  if (!Number.isFinite(total)) return 0;
  const divisor = Number.isFinite(months) && months > 0 ? months : HISTORY_MONTHS;
  return total / Math.max(1, divisor);
}

/** `YYYY-MM-DD` for `<input type="date">` (UTC calendar day). */
export function toDateInputValue(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parse `YYYY-MM-DD` as UTC start-of-day. */
export function parseDateInputStart(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const date = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  return date;
}

/** Parse `YYYY-MM-DD` as UTC end-of-day. */
export function parseDateInputEnd(value: string): Date | null {
  const start = parseDateInputStart(value);
  if (!start) return null;
  return new Date(
    Date.UTC(
      start.getUTCFullYear(),
      start.getUTCMonth(),
      start.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
}

/**
 * Prefer explicit ISO / date-input strings; otherwise the default 3-month window.
 */
export function resolveHistoryWindow(
  periodStart: Date,
  historyFromIso?: string | null,
  historyToIso?: string | null,
): { historyFrom: Date; historyTo: Date } {
  if (historyFromIso && historyToIso) {
    const from =
      parseDateInputStart(historyFromIso) ??
      (() => {
        const parsed = new Date(historyFromIso);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
      })();
    const to =
      parseDateInputEnd(historyToIso) ??
      (() => {
        const parsed = new Date(historyToIso);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
      })();
    if (from && to && from.getTime() < to.getTime()) {
      return { historyFrom: from, historyTo: to };
    }
  }
  return threeMonthHistoryWindow(periodStart);
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
