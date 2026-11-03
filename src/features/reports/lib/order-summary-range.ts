import { manilaTodayIso } from "@/features/orders/utils/manila-calendar";

/** Quick date ranges on the Order summary report. Today is the default. */
export const ORDER_SUMMARY_RANGE_PRESETS = ["TODAY", "YESTERDAY", "THIS_WEEK", "THIS_MONTH", "CUSTOM"] as const;

export type OrderSummaryRangePreset = (typeof ORDER_SUMMARY_RANGE_PRESETS)[number];

export const ORDER_SUMMARY_RANGE_LABELS: Record<OrderSummaryRangePreset, string> = {
  TODAY: "Today",
  YESTERDAY: "Yesterday",
  THIS_WEEK: "This week",
  THIS_MONTH: "This month",
  CUSTOM: "Date range",
};

function isoFromUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Calendar arithmetic on a YYYY-MM-DD date, independent of the runtime's time zone. */
function shiftDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoFromUtcDate(date);
}

/**
 * From/To (inclusive, YYYY-MM-DD, Manila days) for a preset. The week starts on Monday.
 * CUSTOM has no range of its own: the page uses the dates the user picks.
 */
export function orderSummaryRange(
  preset: Exclude<OrderSummaryRangePreset, "CUSTOM">,
  now: Date = new Date(),
): { from: string; to: string } {
  const today = manilaTodayIso(now);
  switch (preset) {
    case "TODAY":
      return { from: today, to: today };
    case "YESTERDAY": {
      const yesterday = shiftDays(today, -1);
      return { from: yesterday, to: yesterday };
    }
    case "THIS_WEEK": {
      const weekday = new Date(`${today}T00:00:00.000Z`).getUTCDay();
      const sinceMonday = (weekday + 6) % 7;
      return { from: shiftDays(today, -sinceMonday), to: today };
    }
    case "THIS_MONTH":
      return { from: `${today.slice(0, 7)}-01`, to: today };
    default: {
      const _exhaustive: never = preset;
      return _exhaustive;
    }
  }
}
