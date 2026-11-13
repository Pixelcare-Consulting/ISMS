import { manilaDayWindow, manilaTodayIso } from "@/features/orders/utils/manila-calendar";

const INVALID_TRANSACTION_DATE = "Invalid transaction date";
const PAST_TRANSACTION_DATE =
  "Transaction date cannot be more than 30 days before today";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Furthest Manila calendar day a new or changed sale date may go back. */
export const SALE_TRANSACTION_LOOKBACK_DAYS = 30;

/** YYYY-MM-DD shifted by whole calendar days. */
export function shiftCalendarIso(iso: string, days: number): string | null {
  const match = ISO_DATE.exec(iso);
  if (!match) return null;
  const shifted = new Date(
    Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]) + days,
    ),
  );
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Earliest transaction date the picker and server accept (today minus 30 Manila days). */
export function earliestSaleTransactionIso(now: Date = new Date()): string {
  return (
    shiftCalendarIso(manilaTodayIso(now), -SALE_TRANSACTION_LOOKBACK_DAYS) ??
    manilaTodayIso(now)
  );
}

export type SaleTransactionDateResult =
  | { date: Date | null }
  | { error: typeof INVALID_TRANSACTION_DATE | typeof PAST_TRANSACTION_DATE };

/**
 * Optional sale header date. A YYYY-MM-DD value is that Manila calendar day.
 * Today, future dates, and past dates back to 30 Manila days are accepted.
 * An older date already stored may stay; a different date before that floor is rejected.
 */
export function resolveSaleTransactionDate(
  value: string | undefined,
  existingCalendarDate?: string | null,
  now: Date = new Date(),
): SaleTransactionDateResult {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return { date: null };

  const calendar = calendarDay(trimmed);
  if (!calendar) return { error: INVALID_TRANSACTION_DATE };

  const keepingExisting =
    existingCalendarDate != null && existingCalendarDate === calendar;
  if (!keepingExisting && calendar < earliestSaleTransactionIso(now)) {
    return { error: PAST_TRANSACTION_DATE };
  }

  const date = storedDate(trimmed, calendar);
  if (!date) return { error: INVALID_TRANSACTION_DATE };
  return { date };
}

function calendarDay(value: string): string | null {
  if (ISO_DATE.test(value)) {
    return manilaDayWindow(value)?.date ?? null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return manilaTodayIso(parsed);
}

function storedDate(value: string, calendar: string): Date | null {
  if (ISO_DATE.test(value)) {
    const ms = Date.parse(`${calendar}T00:00:00.000Z`);
    return Number.isNaN(ms) ? null : new Date(ms);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
