import { manilaDayWindow, manilaTodayIso } from "@/features/orders/utils/manila-calendar";

const INVALID_TRANSACTION_DATE = "Invalid transaction date";
const PAST_TRANSACTION_DATE = "Transaction date cannot be before today";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type SaleTransactionDateResult =
  | { date: Date | null }
  | { error: typeof INVALID_TRANSACTION_DATE | typeof PAST_TRANSACTION_DATE };

/**
 * Optional sale header date. A YYYY-MM-DD value is that Manila calendar day.
 * A date before today is rejected unless it is the date already stored.
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
  if (!keepingExisting && calendar < manilaTodayIso(now)) {
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
