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
  /** Successful uploads (`uploadedAt` set) in the whole Manila month (TL). */
  tlUploadedInMonth?: number;
  /** Successful uploads with `uploadedAt` in days 1–15 (PS). */
  psUploadedH1?: number;
  /** Successful uploads with `uploadedAt` in days 16–end (PS). */
  psUploadedH2?: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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
    message: "Your role has no free P-COUNT uploads. Submit a request for approval.",
  };
}

/**
 * Pure allowance math for TL / PS Manila calendars.
 * Slot consumption is counted from successful uploads only (callers pass counts).
 */
export function resolvePcountUploadAllowance(
  input: ResolvePcountUploadAllowanceInput,
): PcountUploadAllowance {
  const { role, manilaDay } = input;

  if (role === "unlimited") return unlimitedAllowance();
  if (role === "none") return noneAllowance();

  if (role === "tl") {
    const uploaded = Math.max(0, input.tlUploadedInMonth ?? 0);
    const remaining = Math.max(0, 1 - uploaded);
    const canDirectUpload = remaining > 0;
    return {
      role: "tl",
      unlimited: false,
      canDirectUpload,
      mustRequest: !canDirectUpload,
      slotsRemainingToday: remaining,
      slotsRemainingMonth: remaining,
      slotsTotalMonth: 1,
      activeHalf: null,
      message: canDirectUpload
        ? "You have 1 free P-COUNT upload this month for this branch."
        : "Your free monthly P-COUNT upload is used. Submit a request for an extra upload.",
    };
  }

  // role === "ps"
  const uploadedH1 = Math.max(0, input.psUploadedH1 ?? 0);
  const uploadedH2 = Math.max(0, input.psUploadedH2 ?? 0);
  const h1Remaining = Math.max(0, 1 - uploadedH1);
  const h2Remaining = Math.max(0, 1 - uploadedH2);
  const slotsRemainingMonth = h1Remaining + h2Remaining;
  const activeHalf: PcountHalfWindow = manilaDay <= 15 ? "h1" : "h2";
  const activeRemaining = activeHalf === "h1" ? h1Remaining : h2Remaining;
  const otherRemaining = activeHalf === "h1" ? h2Remaining : h1Remaining;
  const canDirectUpload = activeRemaining > 0;

  let message: string;
  if (canDirectUpload) {
    message =
      activeHalf === "h1"
        ? "You can upload once during days 1–15 for this branch."
        : "You can upload once during days 16–end of month for this branch.";
    if (otherRemaining > 0 && activeHalf === "h1") {
      message += " Your second free slot opens on the 16th.";
    }
  } else if (otherRemaining > 0) {
    message =
      activeHalf === "h1"
        ? "Your days 1–15 free upload is used. Your second free slot opens on the 16th, or submit a request for an extra upload now."
        : "Your days 16–end free upload is used. Your first-half slot cannot be used after the 15th — submit a request for an extra upload.";
  } else {
    message =
      "Both free P-COUNT uploads this month are used. Submit a request for an extra upload.";
  }

  return {
    role: "ps",
    unlimited: false,
    canDirectUpload,
    mustRequest: !canDirectUpload,
    slotsRemainingToday: activeRemaining,
    slotsRemainingMonth,
    slotsTotalMonth: 2,
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
