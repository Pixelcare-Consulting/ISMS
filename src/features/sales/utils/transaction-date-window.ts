import { manilaTodayIso } from "@/features/orders/utils/manila-calendar";

/** Used until a tenant saves its own value (matches the column default). */
export const DEFAULT_SALES_BACKDATE_DAYS = 7;
export const MAX_SALES_BACKDATE_DAYS = 365;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface SalesTransactionDateWindow {
  /** Earliest selectable day, YYYY-MM-DD (Manila). */
  min: string;
  /** Latest selectable day: today in Manila. */
  max: string;
  backdateDays: number;
}

function shiftIsoDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + days)).toISOString().slice(0, 10);
}

/** Days a new sale may be dated: from `backdateDays` before today up to today (Manila). */
export function salesTransactionDateWindow(
  backdateDays: number,
  now: Date = new Date(),
): SalesTransactionDateWindow {
  const safeDays = Number.isInteger(backdateDays)
    ? Math.min(Math.max(backdateDays, 0), MAX_SALES_BACKDATE_DAYS)
    : DEFAULT_SALES_BACKDATE_DAYS;
  const max = manilaTodayIso(now);
  return { min: shiftIsoDate(max, -safeDays), max, backdateDays: safeDays };
}

/** Plain-language rule shown under the field and in errors. */
export function describeTransactionDateWindow(window: SalesTransactionDateWindow): string {
  if (window.backdateDays === 0) return "Only today can be selected.";
  const unit = window.backdateDays === 1 ? "day" : "days";
  return `Today or up to ${window.backdateDays} ${unit} back (${window.min} to ${window.max}).`;
}

/** Null when the YYYY-MM-DD value is inside the window; otherwise the error to show. */
export function transactionDateWindowError(
  value: string | null | undefined,
  window: SalesTransactionDateWindow,
): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "Transaction date is required";
  if (!ISO_DATE.test(trimmed) || Number.isNaN(Date.parse(trimmed))) {
    return "Invalid transaction date";
  }
  // YYYY-MM-DD strings compare correctly as text.
  if (trimmed < window.min || trimmed > window.max) {
    return `Transaction date is outside the allowed range. ${describeTransactionDateWindow(window)}`;
  }
  return null;
}
