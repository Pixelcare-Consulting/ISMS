export const MONTHLY_SIR_STATUS_LABELS = {
  pending: "For approval",
  approved: "Approved",
  rejected: "Disapproved",
} as const;

/** Soft outline classes per request status — aligned with order workflow badges. */
export const MONTHLY_SIR_STATUS_VARIANTS: Record<
  keyof typeof MONTHLY_SIR_STATUS_LABELS,
  string
> = {
  pending: "border-amber-200 bg-amber-50 text-amber-800",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-800",
  rejected: "border-rose-200 bg-rose-50 text-rose-800",
};

export const MONTHLY_SIR_VARIANCE_LABELS = {
  matched: "IN FILE AND IN STK",
  surplus: "IN FILE NOT IN STK",
  missing: "STK NOT IN FILE",
  status_mismatch: "STATUS MISMATCH",
} as const;

export const MONTHLY_SIR_SYSTEM_FILL = "FFFF00";
export const MONTHLY_SIR_PCOUNT_FILL = "92D050";
