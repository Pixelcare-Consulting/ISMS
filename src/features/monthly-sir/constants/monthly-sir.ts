export const MONTHLY_SIR_STATUS_LABELS = {
  pending: "For approval",
  approved: "Approved",
  rejected: "Disapproved",
} as const;

export const MONTHLY_SIR_VARIANCE_LABELS = {
  matched: "IN FILE AND IN STK",
  surplus: "IN FILE NOT IN STK",
  missing: "STK NOT IN FILE",
  status_mismatch: "STATUS MISMATCH",
} as const;

export const MONTHLY_SIR_SYSTEM_FILL = "FFFF00";
export const MONTHLY_SIR_PCOUNT_FILL = "92D050";
