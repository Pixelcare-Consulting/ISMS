/**
 * Workbook contract for bulk branch-quota import (Settings → Branch Quotas).
 *
 * Sheet "Branch Quotas" — branch_name, brand_name, month (YYYY-MM), quota_amount.
 * Unique key is branch + brand + month (first of month). Unknown name / brand → row error.
 * Names match after trim, ignoring case. More than one branch with that name is an error.
 * A file that still uses the branch SAP code does not match these columns.
 * Existing rows update quota_amount; missing rows create.
 */

export const BRANCH_QUOTA_SHEET_NAME = "Branch Quotas";

export const BRANCH_QUOTA_SHEET_HEADERS = [
  "branch_name",
  "brand_name",
  "month",
  "quota_amount",
] as const;

/**
 * Normalized header → canonical key.
 * SAP-code headers are intentionally absent so old files fail column checks.
 */
export const BRANCH_QUOTA_IMPORT_ALIAS_MAP: Record<string, string> = {
  branchname: "branchname",
  branch: "branchname",
  brandname: "brandname",
  brand: "brandname",
  month: "month",
  quotamonth: "month",
  quotadate: "month",
  quotaamount: "quotaamount",
  quota: "quotaamount",
  amount: "quotaamount",
};

export const BRANCH_QUOTA_IMPORT_REQUIRED_COLUMNS = [
  "branchname",
  "brandname",
  "month",
  "quotaamount",
] as const;

export const BRANCH_QUOTA_IMPORT_FIELD_LABELS: Record<string, string> = {
  quotaAmount: "Quota amount",
};

export interface BranchQuotaImportRowError {
  sheet: string;
  rowNumber: number;
  /** Branch SAP / brand / month for the reader. */
  identity: string;
  message: string;
}

export interface BranchQuotaImportFieldChange {
  field: string;
  label: string;
  from: string;
  to: string;
}

export type BranchQuotaImportRowAction = "create" | "update" | "skip";

export interface BranchQuotaImportRowPlan {
  rowNumber: number;
  branchSapCode: string;
  branchName: string;
  brandName: string;
  month: string;
  action: BranchQuotaImportRowAction;
  changes: BranchQuotaImportFieldChange[];
}

export interface BranchQuotaImportPreview {
  /**
   * Opaque server-derived handle for the plan built from this upload. The apply
   * sends it back instead of re-uploading the workbook for every chunk.
   */
  planKey?: string;
  rowCount: number;
  createCount: number;
  updateCount: number;
  unchangedCount: number;
  canApply: boolean;
  errors: BranchQuotaImportRowError[];
  rows: BranchQuotaImportRowPlan[];
}

export interface BranchQuotaImportResult {
  created: number;
  updated: number;
  unchanged: number;
}

/** Progress payload for client-driven chunked quota import apply. */
export interface BranchQuotaImportChunkProgress {
  processed: number;
  total: number;
  nextOffset: number;
  done: boolean;
  created: number;
  updated: number;
  unchanged?: number;
  result?: BranchQuotaImportResult;
  planKey?: string;
  /**
   * The cached plan is gone (cold instance or expired TTL). Nothing was written for
   * this chunk — retry the same offset with the workbook attached.
   */
  planExpired?: boolean;
}
