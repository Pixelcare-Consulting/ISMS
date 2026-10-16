const WEEKDAY_BY_SHORT_NAME: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export type AutomationSchedule = {
  timezone: string;
  /** Minutes from midnight in `timezone` (0–1439). */
  timeOfDayMinutes: number;
  /** 0 = Sunday … 6 = Saturday, in `timezone`. */
  weekdays: number[];
};

export type DueDecision =
  | { kind: "not_due" }
  | { kind: "invalid_timezone"; slot: string; error: string }
  | { kind: "invalid_schedule"; slot: string; error: string }
  | { kind: "due"; slot: string };

class InvalidTimeZoneError extends Error {
  constructor(timeZone: string) {
    super(`Invalid timezone: ${timeZone}`);
    this.name = "InvalidTimeZoneError";
  }
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function part(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  return parts.find((entry) => entry.type === type)?.value ?? "";
}

/** Calendar clock in an IANA timezone. Throws InvalidTimeZoneError when the zone is unknown. */
export function zonedClock(
  now: Date,
  timeZone: string,
): { date: string; weekday: number; minutes: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
  } catch (error) {
    if (error instanceof RangeError) throw new InvalidTimeZoneError(timeZone);
    throw error;
  }

  const weekday = WEEKDAY_BY_SHORT_NAME[part(parts, "weekday")];
  if (weekday === undefined) throw new InvalidTimeZoneError(timeZone);

  const rawHour = Number(part(parts, "hour"));
  const hour = rawHour === 24 ? 0 : rawHour;
  const minute = Number(part(parts, "minute"));
  return {
    date: `${part(parts, "year")}-${part(parts, "month")}-${part(parts, "day")}`,
    weekday,
    minutes: hour * 60 + minute,
  };
}

function isValidTimeOfDay(minutes: number): boolean {
  return Number.isInteger(minutes) && minutes >= 0 && minutes <= 1439;
}

function isValidWeekdays(weekdays: number[]): boolean {
  return weekdays.every((day) => Number.isInteger(day) && day >= 0 && day <= 6);
}

/** Local calendar day plus the scheduled time, e.g. `2026-10-16T08:00`. */
export function scheduledSlot(localDate: string, timeOfDayMinutes: number): string {
  const hours = Math.floor(timeOfDayMinutes / 60);
  const minutes = timeOfDayMinutes % 60;
  return `${localDate}T${pad2(hours)}:${pad2(minutes)}`;
}

/**
 * An enabled automation is due once its local weekday is selected and the local
 * clock has reached the scheduled minute. The slot stays the scheduled time, so
 * later ticks the same local day share one idempotency key.
 */
export function decideAutomationDue(schedule: AutomationSchedule, now: Date): DueDecision {
  let clock: { date: string; weekday: number; minutes: number };
  try {
    clock = zonedClock(now, schedule.timezone);
  } catch (error) {
    if (error instanceof InvalidTimeZoneError) {
      const utcDay = now.toISOString().slice(0, 10);
      return {
        kind: "invalid_timezone",
        slot: `invalid-timezone:${utcDay}`,
        error: `Timezone "${schedule.timezone}" is not a valid IANA timezone`,
      };
    }
    throw error;
  }

  if (!isValidTimeOfDay(schedule.timeOfDayMinutes) || !isValidWeekdays(schedule.weekdays)) {
    return {
      kind: "invalid_schedule",
      slot: `invalid-schedule:${clock.date}`,
      error:
        "Schedule must use a time of day from 00:00 through 23:59 and weekdays 0 (Sunday) through 6 (Saturday)",
    };
  }

  if (schedule.weekdays.length === 0 || !schedule.weekdays.includes(clock.weekday)) {
    return { kind: "not_due" };
  }
  if (clock.minutes < schedule.timeOfDayMinutes) {
    return { kind: "not_due" };
  }
  return { kind: "due", slot: scheduledSlot(clock.date, schedule.timeOfDayMinutes) };
}
