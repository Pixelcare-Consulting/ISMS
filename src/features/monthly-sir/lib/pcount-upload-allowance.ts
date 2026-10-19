import { DEFAULT_TL_MONTHLY_FREE_SLOTS } from "@/features/monthly-sir/constants/monthly-sir";
import { manilaMonthWindow } from "@/features/orders/utils/manila-calendar";

export type PcountAllowanceRole = "unlimited" | "tl" | "ps" | "none";

export type PcountHalfWindow = "h1" | "h2";

export interface PcountMonthWindows {
  year: number;
  month: number;
  day: number;
  monthStart: Date;
  monthEndExclusive: Date;
  h1Start: Date;
  h1EndExclusive: Date;
  h2Start: Date;
  h2EndExclusive: Date;
  activeHalf: PcountHalfWindow;
}

export interface PcountUploadAllowance {
  role: PcountAllowanceRole;
  unlimited: boolean;
  canDirectUpload: boolean;
  mustRequest: boolean;
  /** Free slots still usable today (0 when request-only). Null when unlimited. */
  slotsRemainingToday: number | null;
  /** Free slots left in the Manila month. Null when unlimited or when PS has no slot cap. */
  slotsRemainingMonth: number | null;
  /** Monthly free-slot budget for this role. Null when unlimited, none, or PS. */
  slotsTotalMonth: number | null;
  /** Active PS half when role is ps; otherwise null. PS no longer uses halves. */
  activeHalf: PcountHalfWindow | null;
  /** End-user guidance (closed calendar day, exhausted TL slot, etc.). */
  message: string | null;
}

export interface ResolvePcountUploadAllowanceInput {
  role: PcountAllowanceRole;
  /** Manila calendar day of month (1–31). */
  manilaDay: number;
  /**
   * Free/direct Starts (`usesFreeSlot`) in the whole Manila month (TL).
   * Does not include request+approval extras.
   */
  tlFreeStartsInMonth?: number;
  /** Manila calendar year. Required for the PS last-3-days check (February length). */
  manilaYear?: number;
  /** Manila calendar month (1–12). Required with `manilaYear` for PS. */
  manilaMonth?: number;
  /** Free/direct Starts with `createdAt` in days 1–15 (unused; PS has no slot cap). */
  psFreeStartsH1?: number;
  /** Free/direct Starts with `createdAt` in days 16–end (unused; PS has no slot cap). */
  psFreeStartsH2?: number;
  /** Tenant TL monthly free-slot budget (defaults to 1). */
  tlMonthlyFreeSlots?: number;
  /** Unused for the PS calendar gate. Kept so older callers still type-check. */
  psMonthlyFreeSlots?: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const PS_PCOUNT_UPLOAD_CLOSED_MESSAGE =
  "P-COUNT upload is closed today, even when a request is already approved. Product Specialists can upload on the 14th, 15th, 16th, the last 3 days of the month, and the 1st of the next month.";

/** Days in a Gregorian month. `month` is 1–12. Leap years change February. */
export function manilaDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * PS may upload on the 14th–16th, the last 3 days of the month, and the 1st.
 * The 1st closes the previous month.
 */
export function isPsPcountUploadDay(
  year: number,
  month: number,
  day: number,
): boolean {
  if (day === 1 || day === 14 || day === 15 || day === 16) return true;
  const last = manilaDaysInMonth(year, month);
  return day >= last - 2 && day <= last;
}

export function psPcountUploadOpenMessage(day: number): string {
  if (day === 1) {
    return "You can upload a P-COUNT today. The 1st closes the previous month.";
  }
  return "You can upload a P-COUNT today.";
}

/** Throws when a PS user tries to upload outside the Manila calendar window. */
export function assertPsPcountUploadAllowed(input: {
  role: PcountAllowanceRole;
  year: number;
  month: number;
  day: number;
}): void {
  switch (input.role) {
    case "unlimited":
    case "tl":
    case "none":
      return;
    case "ps":
      if (isPsPcountUploadDay(input.year, input.month, input.day)) return;
      throw new Error(PS_PCOUNT_UPLOAD_CLOSED_MESSAGE);
    default: {
      const _exhaustive: never = input.role;
      throw new Error(`Unknown P-COUNT role: ${String(_exhaustive)}`);
    }
  }
}

function sanitizeSlotBudget(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

/** Resolve Manila month bounds. Half-month instants are unused by the PS calendar gate. */
export function pcountMonthWindows(at: Date = new Date()): PcountMonthWindows {
  const { year, month, day, start, endExclusive } = manilaMonthWindow(at);
  const h1Start = start;
  const h2Start = new Date(start.getTime() + 15 * MS_PER_DAY);
  const h1EndExclusive = h2Start;
  const h2EndExclusive = endExclusive;
  const activeHalf: PcountHalfWindow = day <= 15 ? "h1" : "h2";
  return {
    year,
    month,
    day,
    monthStart: start,
    monthEndExclusive: endExclusive,
    h1Start,
    h1EndExclusive,
    h2Start,
    h2EndExclusive,
    activeHalf,
  };
}

/**
 * Map session permissions + role slugs to a P-Count allowance role.
 * `inventory.manage` (and unrestricted admins) win over TL/PS slot budgets.
 */
export function resolvePcountAllowanceRole(
  permissions: string[] | undefined,
  roleSlugs: string[] | undefined,
  options?: { unrestricted?: boolean },
): PcountAllowanceRole {
  if (
    options?.unrestricted ||
    (permissions?.includes("inventory.manage") ?? false)
  ) {
    return "unlimited";
  }
  const slugs = roleSlugs ?? [];
  // Prefer PS when dual-roled (matches dashboard persona ordering).
  if (slugs.includes("ps")) return "ps";
  if (slugs.includes("tl")) return "tl";
  return "none";
}

function unlimitedAllowance(): PcountUploadAllowance {
  return {
    role: "unlimited",
    unlimited: true,
    canDirectUpload: true,
    mustRequest: false,
    slotsRemainingToday: null,
    slotsRemainingMonth: null,
    slotsTotalMonth: null,
    activeHalf: null,
    message: null,
  };
}

function noneAllowance(): PcountUploadAllowance {
  return {
    role: "none",
    unlimited: false,
    canDirectUpload: false,
    mustRequest: true,
    slotsRemainingToday: 0,
    slotsRemainingMonth: 0,
    slotsTotalMonth: 0,
    activeHalf: null,
    message: "No free uploads. Submit a request for approval.",
  };
}

/**
 * Pure allowance math for TL / PS Manila calendars.
 * Slot consumption is counted from free/direct Starts only (callers pass counts).
 */
export function resolvePcountUploadAllowance(
  input: ResolvePcountUploadAllowanceInput,
): PcountUploadAllowance {
  const { role, manilaDay } = input;

  if (role === "unlimited") return unlimitedAllowance();
  if (role === "none") return noneAllowance();

  if (role === "tl") {
    const budget = sanitizeSlotBudget(
      input.tlMonthlyFreeSlots,
      DEFAULT_TL_MONTHLY_FREE_SLOTS,
    );
    const used = Math.max(0, input.tlFreeStartsInMonth ?? 0);
    const remaining = Math.max(0, budget - used);
    const canDirectUpload = remaining > 0;
    return {
      role: "tl",
      unlimited: false,
      canDirectUpload,
      mustRequest: !canDirectUpload,
      slotsRemainingToday: remaining,
      slotsRemainingMonth: remaining,
      slotsTotalMonth: budget,
      activeHalf: null,
      message: canDirectUpload
        ? `${budget} free upload${budget === 1 ? "" : "s"} this month for this branch.`
        : "Free upload used. Request an extra upload.",
    };
  }

  if (role !== "ps") {
    const _exhaustive: never = role;
    return _exhaustive;
  }

  // Calendar days only. No half-month slot cap.
  const year = input.manilaYear;
  const month = input.manilaMonth;
  const uploadOpen =
    typeof year === "number" && typeof month === "number"
      ? isPsPcountUploadDay(year, month, manilaDay)
      : manilaDay === 1 || manilaDay === 14 || manilaDay === 15 || manilaDay === 16;

  if (!uploadOpen) {
    return {
      role: "ps",
      unlimited: false,
      canDirectUpload: false,
      mustRequest: true,
      slotsRemainingToday: 0,
      slotsRemainingMonth: null,
      slotsTotalMonth: null,
      activeHalf: null,
      message: PS_PCOUNT_UPLOAD_CLOSED_MESSAGE,
    };
  }

  return {
    role: "ps",
    unlimited: false,
    canDirectUpload: true,
    mustRequest: false,
    slotsRemainingToday: null,
    slotsRemainingMonth: null,
    slotsTotalMonth: null,
    activeHalf: null,
    message: psPcountUploadOpenMessage(manilaDay),
  };
}

/** Exhaustive role switch helper for callers that need a default branch. */
export function assertPcountAllowanceRole(
  role: PcountAllowanceRole,
): PcountAllowanceRole {
  switch (role) {
    case "unlimited":
    case "tl":
    case "ps":
    case "none":
      return role;
    default: {
      const _exhaustive: never = role;
      return _exhaustive;
    }
  }
}
