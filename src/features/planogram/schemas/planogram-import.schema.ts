/**
 * Workbook contract for bulk planogram import (Settings → Planogram).
 *
 * Sheet "Planogram" — one row per branch name + SKU + shelf max. Template-only:
 * the old BRS wide Y/N layout is rejected here. A file that still uses the
 * branch SAP code does not match these columns.
 *
 * SKUs and branch names must already exist. Names match after trim, ignoring
 * case. More than one branch with that name is an error. Rows not in the file
 * are not deleted. Extra columns (including leftover mil_days) are ignored.
 * Branch Target Quota uses the SFE Forecast template on Planning.
 */

export const PLANOGRAM_SHEET_NAME = "Planogram";

export const PLANOGRAM_SHEET_HEADERS = ["branch_name", "sku", "shelf_max"] as const;

/** Download header shown when a required canonical column is missing. */
export const PLANOGRAM_IMPORT_COLUMN_LABELS: Record<string, string> = {
  branch_name: "branch_name",
  sku: "sku",
  shelf_max: "shelf_max",
};

/**
 * Normalized header → canonical key for our template columns only.
 * SAP-code headers are intentionally absent so old files fail column checks.
 */
export const PLANOGRAM_IMPORT_ALIAS_MAP: Record<string, string> = {
  branchname: "branch_name",
  branch: "branch_name",
  sku: "sku",
  skucode: "sku",
  itemcode: "sku",
  itemno: "sku",
  shelfmax: "shelf_max",
  maxqty: "shelf_max",
};

export const PLANOGRAM_IMPORT_REQUIRED_COLUMNS = ["branch_name", "sku", "shelf_max"] as const;

export const PLANOGRAM_DEFAULT_MAX_QTY = 1;

export const PLANOGRAM_DEFAULT_MIL_DAYS = 30;

export const PLANOGRAM_IMPORT_FIELD_LABELS: Record<string, string> = {
  allowedModel: "Allowed model",
  maxQty: "Shelf max",
};

export interface PlanogramImportRowError {
  sheet: string;
  rowNumber: number;
  sapCode: string;
  sku: string;
  message: string;
}

export interface PlanogramImportFieldChange {
  field: string;
  label: string;
  from: string;
  to: string;
}

export type PlanogramImportRowAction = "create" | "update" | "skip";

export interface PlanogramImportRowPlan {
  rowNumber: number;
  sapCode: string;
  sku: string;
  branchName: string;
  maxQty: number;
  milDays: number;
  action: PlanogramImportRowAction;
  changes: PlanogramImportFieldChange[];
  willAddAllowedModel: boolean;
}

export interface PlanogramImportPreview {
  /**
   * Opaque server-derived handle for the plan built from this upload. The apply
   * sends it back instead of re-uploading the workbook for every chunk; it is a
   * digest of the file, never a plan the browser could tamper with.
   */
  planKey?: string;
  rowCount: number;
  createCount: number;
  updateCount: number;
  unchangedCount: number;
  allowedModelAddCount: number;
  canApply: boolean;
  errors: PlanogramImportRowError[];
  rows: PlanogramImportRowPlan[];
}

export interface PlanogramImportResult {
  created: number;
  updated: number;
  unchanged: number;
  allowedModelsAdded: number;
}

/** Progress payload for client-driven chunked planogram import apply. */
export interface PlanogramImportChunkProgress {
  processed: number;
  total: number;
  nextOffset: number;
  done: boolean;
  /** Counts written in this chunk only — client accumulates across the loop. */
  created: number;
  updated: number;
  allowedModelsAdded: number;
  /** Present on every chunk from the pre-write plan. */
  unchanged?: number;
  /** Present only when the final chunk succeeds. */
  result?: PlanogramImportResult;
  /** Echoed back so the client keeps addressing the same cached plan. */
  planKey?: string;
  /**
   * The cached plan is gone (cold instance or expired TTL). Nothing was written for
   * this chunk — retry the same offset with the workbook attached.
   */
  planExpired?: boolean;
}
