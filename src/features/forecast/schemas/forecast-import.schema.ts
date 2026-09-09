/**
 * Workbook contract for bulk forecast import (Settings → Planning).
 *
 * Sheet "Forecast" — one row per branch. Template-only: the old BRS wide Y/N
 * layout is rejected here (shelf max belongs on Planogram).
 *
 * Branch SAP codes must already exist. This import does not create branches,
 * SKUs, or planogram rows. Targets left out of the file are not deleted.
 *
 * `branch_name` is download-only for reading; upload ignores it.
 */

export const FORECAST_SHEET_NAME = "Forecast";

export const FORECAST_SHEET_HEADERS = [
  "period",
  "branch_sap_code",
  "revenue_target",
  "branch_name",
] as const;

/** Download header shown when a required canonical column is missing. */
export const FORECAST_IMPORT_COLUMN_LABELS: Record<string, string> = {
  period: "period",
  sap_code: "branch_sap_code",
  revenue_target: "revenue_target",
};

/** Normalized header → canonical key for our template columns only. */
export const FORECAST_IMPORT_ALIAS_MAP: Record<string, string> = {
  period: "period",
  periodlabel: "period",
  planningperiod: "period",
  sapcode: "sap_code",
  sap_code: "sap_code",
  branchcode: "sap_code",
  branchsapcode: "sap_code",
  revenuetarget: "revenue_target",
  revenue_target: "revenue_target",
};

export const FORECAST_IMPORT_REQUIRED_COLUMNS = ["period", "sap_code", "revenue_target"] as const;

export const FORECAST_IMPORT_FIELD_LABELS: Record<string, string> = {
  revenueTarget: "Revenue target",
};

export interface ForecastImportRowError {
  sheet: string;
  rowNumber: number;
  sapCode: string;
  period: string;
  message: string;
}

export interface ForecastImportFieldChange {
  field: string;
  label: string;
  from: string;
  to: string;
}

export type ForecastImportRowAction = "create" | "update" | "skip";

export interface ForecastImportRowPlan {
  rowNumber: number;
  period: string;
  sapCode: string;
  branchName: string;
  revenueTarget: number;
  action: ForecastImportRowAction;
  changes: ForecastImportFieldChange[];
}

export interface ForecastImportPreview {
  /**
   * Opaque server-derived handle for the plan built from this upload. The apply
   * sends it back instead of re-uploading the workbook for every chunk; it is a
   * digest of the file, never a plan the browser could tamper with.
   */
  planKey?: string;
  periodLabel: string;
  periodWillActivate: boolean;
  rowCount: number;
  createCount: number;
  updateCount: number;
  unchangedCount: number;
  canApply: boolean;
  errors: ForecastImportRowError[];
  rows: ForecastImportRowPlan[];
}

export interface ForecastImportResult {
  periodLabel: string;
  created: number;
  updated: number;
  unchanged: number;
}

/** Progress payload for client-driven chunked forecast import apply. */
export interface ForecastImportChunkProgress {
  processed: number;
  total: number;
  nextOffset: number;
  done: boolean;
  /** Counts written in this chunk only — client accumulates across the loop. */
  created: number;
  updated: number;
  /** Present on every chunk from the pre-write plan. */
  unchanged?: number;
  periodLabel?: string;
  /** Present only when the final chunk succeeds. */
  result?: ForecastImportResult;
  /** Echoed back so the client keeps addressing the same cached plan. */
  planKey?: string;
  /**
   * The cached plan is gone (cold instance or expired TTL). Nothing was written for
   * this chunk — retry the same offset with the workbook attached.
   */
  planExpired?: boolean;
}
