import type {
  StockCountSessionStatus,
  StockVarianceStatus,
} from "@prisma/client";

/**
 * Session labels mapped to SAP B1 Inventory Counting / Posting lifecycle:
 * Open (draft / in_progress) → Counted → Review → Post differences → Closed.
 */
export const STOCK_COUNT_SESSION_LABELS: Record<StockCountSessionStatus, string> = {
  draft: "Open (draft)",
  in_progress: "Counting (open)",
  counting_complete: "Counted",
  variances_under_investigation: "Under investigation",
  pending_adjustment: "Ready to post",
  posting: "Posting",
  adjustment_requested: "Posted — pending SAP",
  closed: "Closed",
};

export const STOCK_VARIANCE_STATUS_LABELS: Record<StockVarianceStatus, string> = {
  open: "Open",
  investigating: "Investigating",
  approved_adjustment: "Approved for posting",
  rejected: "Rejected",
  sap_handoff: "Pending live SAP",
  closed: "Closed",
};

export const VARIANCE_TYPES = {
  missing: "missing",
  surplus: "surplus",
  status_mismatch: "status_mismatch",
} as const;

export type VarianceType = (typeof VARIANCE_TYPES)[keyof typeof VARIANCE_TYPES];

/** Variances included in session-level Post differences. */
export const POSTABLE_VARIANCE_STATUSES = [
  "open",
  "investigating",
  "approved_adjustment",
] as const satisfies readonly StockVarianceStatus[];

export type PostableVarianceStatus = (typeof POSTABLE_VARIANCE_STATUSES)[number];

/** Session statuses that soft-freeze STK movement for counted serials. */
export const STOCK_COUNT_FREEZE_SESSION_STATUSES: StockCountSessionStatus[] = [
  "in_progress",
  "counting_complete",
  "variances_under_investigation",
  "pending_adjustment",
  "posting",
];
