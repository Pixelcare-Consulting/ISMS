import {
  DEFAULT_PS_MONTHLY_FREE_SLOTS,
  DEFAULT_TL_MONTHLY_FREE_SLOTS,
} from "@/features/monthly-sir/constants/monthly-sir";
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
  /** Free slots left in the Manila month (unused halves for PS). Null when unlimited. */
  slotsRemainingMonth: number | null;
  /** Monthly free-slot budget for this role. Null when unlimited / none. */
  slotsTotalMonth: number | null;
  /** Active PS half when role is ps; otherwise null. */
  activeHalf: PcountHalfWindow | null;
  /** End-user guidance (wrong half-window, exhausted, etc.). */
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
  /** Free/direct Starts with `createdAt` in days 1–15 (PS). */
  psFreeStartsH1?: number;
  /** Free/direct Starts with `createdAt` in days 16–end (PS). */
  psFreeStartsH2?: number;
  /** Tenant TL monthly free-slot budget (defaults to 1). */
  tlMonthlyFreeSlots?: number;
  /** Tenant PS monthly free-slot budget (defaults to 2; split across halves). */
  psMonthlyFreeSlots?: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Split a PS monthly budget across H1 (ceil) and H2 (floor). */
export function splitPsMonthlyFreeSlots(monthlyFreeSlots: number): {
  h1Quota: number;
  h2Quota: number;
} {
  const total = Math.max(0, Math.floor(monthlyFreeSlots));
  return {
    h1Quota: Math.ceil(total / 2),
    h2Quota: Math.floor(total / 2),
  };
}

function sanitizeSlotBudget(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

/** Resolve Manila month + PS half-month windows for allowance checks. */
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

  // role === "ps"
  const monthlyBudget = sanitizeSlotBudget(
    input.psMonthlyFreeSlots,
    DEFAULT_PS_MONTHLY_FREE_SLOTS,
  );
  const { h1Quota, h2Quota } = splitPsMonthlyFreeSlots(monthlyBudget);
  const usedH1 = Math.max(0, input.psFreeStartsH1 ?? 0);
  const usedH2 = Math.max(0, input.psFreeStartsH2 ?? 0);
  const h1Remaining = Math.max(0, h1Quota - usedH1);
  const h2Remaining = Math.max(0, h2Quota - usedH2);
  const slotsRemainingMonth = h1Remaining + h2Remaining;
  const activeHalf: PcountHalfWindow = manilaDay <= 15 ? "h1" : "h2";
  const activeRemaining = activeHalf === "h1" ? h1Remaining : h2Remaining;
  const otherRemaining = activeHalf === "h1" ? h2Remaining : h1Remaining;
  const canDirectUpload = activeRemaining > 0;

  let message: string;
  if (canDirectUpload) {
    message =
      activeHalf === "h1"
        ? `${activeRemaining} free upload${activeRemaining === 1 ? "" : "s"} in days 1–15.`
        : `${activeRemaining} free upload${activeRemaining === 1 ? "" : "s"} in days 16–end.`;
    if (otherRemaining > 0 && activeHalf === "h1") {
      message += " More open on the 16th.";
    }
  } else if (otherRemaining > 0) {
    message =
      activeHalf === "h1"
        ? "Days 1–15 used. Next free slot opens on the 16th, or request an extra now."
        : "Days 16–end used. Request an extra upload.";
  } else {
    message = "Both free uploads used. Request an extra upload.";
  }

  return {
    role: "ps",
    unlimited: false,
    canDirectUpload,
    mustRequest: !canDirectUpload,
    slotsRemainingToday: activeRemaining,
    slotsRemainingMonth,
    slotsTotalMonth: monthlyBudget,
    activeHalf,
    message,
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
