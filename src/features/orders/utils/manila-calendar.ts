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

export interface ManilaDayWindow {
  /** The calendar date itself, YYYY-MM-DD. */
  date: string;
  /** 00:00:00.000 Asia/Manila. */
  start: Date;
  /** 23:59:59.999 Asia/Manila. */
  end: Date;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Bounds of one Manila calendar day, independent of the server's time zone.
 * Returns null for anything that isn't a real YYYY-MM-DD date.
 */
export function manilaDayWindow(isoDate: string): ManilaDayWindow | null {
  const match = ISO_DATE.exec(isoDate);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const start = manilaMidnightUtc(year, month, day);
  const parts = manilaDateParts(start);
  if (parts.year !== year || parts.month !== month || parts.day !== day) return null;
  return { date: isoDate, start, end: new Date(manilaMidnightUtc(year, month, day + 1).getTime() - 1) };
}

/** Today's date in Manila as YYYY-MM-DD (works on server and in the browser). */
export function manilaTodayIso(at: Date = new Date()): string {
  const { year, month, day } = manilaDateParts(at);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
