/**
 * Calendar-month bounds from a planning period label (Asia/Manila date, stored as UTC).
 *
 * Canonical label: MMM-YY (UTC month start, e.g. Sep 2015 → Sep-15).
 * Also accepts YYYYMMDD, YYYY-MM-DD, YYYY-MM, Dec-25, Dec 2025, December 2025.
 */

const MONTH_SHORT = [
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

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

export interface CalendarMonthBounds {
  startDate: Date;
  endDate: Date;
}

function expandYear(year: number): number {
  if (year < 100) return year >= 70 ? 1900 + year : 2000 + year;
  return year;
}

function boundsForMonth(year: number, monthIndex: number): CalendarMonthBounds | null {
  if (!Number.isFinite(year) || year < 1970 || year > 9999) return null;
  if (monthIndex < 0 || monthIndex > 11) return null;

  const startDate = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999));
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
  return { startDate, endDate };
}

/**
 * Format a date as the canonical period label MMM-YY (UTC month).
 */
export function formatPeriodLabelFromDate(date: Date): string {
  const month = MONTH_SHORT[date.getUTCMonth()];
  const year = String(date.getUTCFullYear()).slice(-2);
  return `${month}-${year}`;
}

/**
 * Parse a period label into the first and last instant of that calendar month (UTC).
 * Returns null when the label is not a month.
 */
export function calendarMonthBoundsFromLabel(label: string): CalendarMonthBounds | null {
  const trimmed = label.trim();
  if (!trimmed) return null;

  const yyyymmdd = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (yyyymmdd) {
    const year = Number.parseInt(yyyymmdd[1], 10);
    const month = Number.parseInt(yyyymmdd[2], 10);
    const day = Number.parseInt(yyyymmdd[3], 10);
    if (day < 1 || day > 31) return null;
    return boundsForMonth(year, month - 1);
  }

  const isoDate = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoDate) {
    const year = Number.parseInt(isoDate[1], 10);
    const month = Number.parseInt(isoDate[2], 10);
    const day = Number.parseInt(isoDate[3], 10);
    if (day < 1 || day > 31) return null;
    return boundsForMonth(year, month - 1);
  }

  const iso = trimmed.match(/^(\d{4})[-/](\d{1,2})$/);
  if (iso) {
    const year = Number.parseInt(iso[1], 10);
    const month = Number.parseInt(iso[2], 10);
    return boundsForMonth(year, month - 1);
  }

  const named = trimmed.match(/^([A-Za-z]+)\s*[-/\s]\s*(\d{2,4})$/);
  if (named) {
    const monthIndex = MONTH_INDEX[named[1].toLowerCase()];
    if (monthIndex == null) return null;
    const year = expandYear(Number.parseInt(named[2], 10));
    return boundsForMonth(year, monthIndex);
  }

  return null;
}

/**
 * Normalize any accepted period label to canonical MMM-YY.
 * Returns null when the label cannot be parsed as a month.
 */
export function normalizePeriodLabel(label: string): string | null {
  const bounds = calendarMonthBoundsFromLabel(label);
  if (!bounds) return null;
  return formatPeriodLabelFromDate(bounds.startDate);
}

/**
 * Display helper: show MMM-YY when the label is parseable, otherwise the raw value.
 */
export function displayPeriodLabel(label: string): string {
  return normalizePeriodLabel(label) ?? label;
}

export function periodDateFieldsFromLabel(label: string): {
  startDate: Date;
  endDate: Date;
} | Record<string, never> {
  const bounds = calendarMonthBoundsFromLabel(label);
  if (!bounds) return {};
  return { startDate: bounds.startDate, endDate: bounds.endDate };
}
