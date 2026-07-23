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
  deliveryDays?: number[];
}

export interface OrderingPolicyConfig {
  globalLockedWeekdays: number[];
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
