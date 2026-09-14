const MANILA_TZ = "Asia/Manila";

export interface ManilaMonthWindow {
  year: number;
  month: number;
  day: number;
  daysElapsed: number;
  start: Date;
  endExclusive: Date;
}

function manilaDateParts(at: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  return { year, month, day };
}

/** Instant for YYYY-MM-DD 00:00:00 in Asia/Manila (no DST). */
function manilaMidnightUtc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, -8, 0, 0, 0));
}

/** Current Manila calendar month bounds and days elapsed (1-based day of month). */
export function manilaMonthWindow(at: Date = new Date()): ManilaMonthWindow {
  const { year, month, day } = manilaDateParts(at);
  const start = manilaMidnightUtc(year, month, 1);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const endExclusive = manilaMidnightUtc(nextYear, nextMonth, 1);
  return {
    year,
    month,
    day,
    daysElapsed: Math.max(1, day),
    start,
    endExclusive,
  };
}
