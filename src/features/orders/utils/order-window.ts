/**
 * Ordering-window rules shared by the server (hard enforcement) and the client
 * (advisory notices). Weekdays are integers 0=Sunday … 6=Saturday.
 */

export const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Weekday used to gate ordering, resolved in Asia/Manila (branch-local time). */
export function manilaWeekday(now: Date = new Date()): number {
  const short = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    weekday: "short",
  }).format(now);
  const idx = WEEKDAY_SHORT.indexOf(short as (typeof WEEKDAY_SHORT)[number]);
  return idx === -1 ? now.getDay() : idx;
}

/** Minutes from midnight in Asia/Manila (0–1439). */
export function manilaMinutesOfDay(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  // Intl may return "24" for midnight in some environments.
  const normalizedHour = hour === 24 ? 0 : hour;
  return normalizedHour * 60 + minute;
}

/** Format minutes-from-midnight as a short 12-hour clock label (e.g. 540 → "9:00 AM"). */
export function formatMinutesAsClock(minutes: number): string {
  const clamped = Math.max(0, Math.min(1439, Math.floor(minutes)));
  const h24 = Math.floor(clamped / 60);
  const m = clamped % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/** Convert `HH:MM` (from `<input type="time">`) to minutes from midnight, or null. */
export function timeValueToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Convert minutes from midnight to `HH:MM` for `<input type="time">`. */
export function minutesToTimeValue(minutes: number): string {
  const clamped = Math.max(0, Math.min(1439, Math.floor(minutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatWeekdayList(days: number[]): string {
  const sorted = [...new Set(days)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
  if (sorted.length === 0) return "none";
  return sorted.map((d) => WEEKDAY_LABELS[d]).join(", ");
}

/** Weekdays 0–6 not present in `orderDays` — i.e. the locked ordering days. */
export function lockedOrderDays(orderDays: number[]): number[] {
  const allowed = new Set(orderDays);
  return [0, 1, 2, 3, 4, 5, 6].filter((d) => !allowed.has(d));
}

export interface BranchOrderingSchedule {
  orderDays: number[];
}

export interface OrderingPolicyConfig {
  globalLockedWeekdays: number[];
  dailyLockEnabled?: boolean;
  dailyLockStartMinutes?: number | null;
  dailyLockEndMinutes?: number | null;
}

/** Default policy when a tenant has no explicit row: Sunday is locked. */
export const DEFAULT_LOCKED_WEEKDAYS = [0];

export type OrderWindowAction = "create" | "approve";

/**
 * Returns a human-readable reason when the action is blocked, or `null` when
 * allowed. Non-throwing so both UI and server can reuse it.
 */
export function checkOrderingAllowed(params: {
  action: OrderWindowAction;
  now?: Date;
  policy: OrderingPolicyConfig | null;
  branchName?: string;
  schedule: BranchOrderingSchedule | null;
}): string | null {
  const weekday = manilaWeekday(params.now);
  const locked = params.policy?.globalLockedWeekdays ?? DEFAULT_LOCKED_WEEKDAYS;

  if (locked.includes(weekday)) {
    const verb = params.action === "create" ? "created or submitted" : "approved";
    return `Orders cannot be ${verb} on ${WEEKDAY_LABELS[weekday]} (company ordering policy).`;
  }

  const dailyEnabled = params.policy?.dailyLockEnabled === true;
  const start = params.policy?.dailyLockStartMinutes;
  const end = params.policy?.dailyLockEndMinutes;
  if (
    dailyEnabled &&
    typeof start === "number" &&
    typeof end === "number" &&
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    start >= 0 &&
    end <= 1439 &&
    start < end
  ) {
    const nowMinutes = manilaMinutesOfDay(params.now);
    if (nowMinutes >= start && nowMinutes < end) {
      const verb = params.action === "create" ? "created or submitted" : "approved";
      return `Orders cannot be ${verb} between ${formatMinutesAsClock(start)} and ${formatMinutesAsClock(end)} (company ordering policy).`;
    }
  }

  // Branch ordering window only gates order placement, not internal approvals.
  if (params.action === "create" && params.schedule?.orderDays?.length) {
    if (!params.schedule.orderDays.includes(weekday)) {
      const who = params.branchName ?? "This branch";
      return `${who} is not accepting orders today (${WEEKDAY_LABELS[weekday]}). Ordering days: ${formatWeekdayList(
        params.schedule.orderDays,
      )}.`;
    }
  }

  return null;
}

export class OrderWindowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderWindowError";
  }
}

/** Throwing variant used by the order service to hard-block the action. */
export function assertOrderingAllowed(params: {
  action: OrderWindowAction;
  now?: Date;
  policy: OrderingPolicyConfig | null;
  branchName?: string;
  schedule: BranchOrderingSchedule | null;
}): void {
  const reason = checkOrderingAllowed(params);
  if (reason) throw new OrderWindowError(reason);
}
