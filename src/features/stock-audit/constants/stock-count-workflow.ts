import type {
  StockCountSessionStatus,
  StockVarianceStatus,
} from "@prisma/client";

export const STOCK_COUNT_SESSION_LABELS: Record<StockCountSessionStatus, string> = {
  draft: "Draft",
  in_progress: "In progress",
  counting_complete: "Counting complete",
  variances_under_investigation: "Under investigation",
  pending_adjustment: "Pending adjustment",
  adjustment_requested: "Adjustment requested",
  closed: "Closed",
};

export const STOCK_VARIANCE_STATUS_LABELS: Record<StockVarianceStatus, string> = {
  open: "Open",
  investigating: "Investigating",
  approved_adjustment: "Approved for adjustment",
  rejected: "Rejected",
  sap_handoff: "SAP handoff",
  closed: "Closed",
};

export const VARIANCE_TYPES = {
  missing: "missing",
  surplus: "surplus",
  status_mismatch: "status_mismatch",
} as const;

export type VarianceType = (typeof VARIANCE_TYPES)[keyof typeof VARIANCE_TYPES];
