/**
 * Workbook contract for bulk product-model import (Master data → Models).
 *
 * Sheet "Models" — form-aligned columns. Template-only: foreign layouts
 * (e.g. PSG ItemNo / ItemName) are rejected.
 *
 * Unknown SKUs are created; existing SKUs are updated when fields differ.
 * Unchanged rows are skipped. Nothing is deleted.
 */

export const MODEL_SHEET_NAME = "Models";

export const MODEL_SHEET_HEADERS = [
  "sku",
  "name",
  "brand",
  "series",
  "feature",
  "resolution",
  "actual_size",
  "status",
] as const;

/** Normalized header → canonical key for our template columns only. */
export const MODEL_IMPORT_ALIAS_MAP: Record<string, string> = {
  sku: "sku",
  skucode: "sku",
  name: "name",
  modelname: "name",
  brand: "brand",
  brandname: "brand",
  series: "series",
  seriesname: "series",
  feature: "feature",
  featurename: "feature",
  resolution: "resolution",
  actualsize: "actual_size",
  actual_size: "actual_size",
  size: "actual_size",
  status: "status",
};

export const MODEL_IMPORT_REQUIRED_COLUMNS = ["sku", "name", "brand", "series"] as const;

export const MODEL_IMPORT_FIELD_LABELS: Record<string, string> = {
  name: "Name",
  brand: "Brand",
  series: "Series",
  feature: "Feature",
  resolution: "Resolution",
  actualSize: "Actual size",
  status: "Status",
};

export interface ModelImportRowError {
  sheet: string;
  rowNumber: number;
  sku: string;
  message: string;
}

export interface ModelImportFieldChange {
  field: string;
  label: string;
  from: string;
  to: string;
}

export interface ModelImportRowPlan {
  rowNumber: number;
  sku: string;
  name: string;
  brand: string;
  series: string;
  feature: string | null;
  resolution: string | null;
  actualSize: string | null;
  status: "active" | "hold" | "retired";
  action: "create" | "update" | "skip";
  changes: ModelImportFieldChange[];
}

/** One SAP write outcome kept as an example under the import's summary. */
export interface ModelImportSapFailure {
  sku: string;
  message: string;
}

export interface ModelImportPreview {
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
  canApply: boolean;
  /**
   * Rows whose brand will be checked against SAP's `U_Brand` after the ISMS writes.
   * Every valid row counts here — only the ones SAP disagrees with are written, and
   * that comparison happens at apply time so the preview stays offline.
   */
  sapBrandRowCount: number;
  errors: ModelImportRowError[];
  rows: ModelImportRowPlan[];
}

export interface ModelImportResult {
  modelsCreated: number;
  modelsUpdated: number;
  modelsUnchanged: number;
  brandsCreated: number;
  seriesCreated: number;
  /** SAP items whose `U_Brand` was written. */
  sapBrandsUpdated: number;
  /** SAP items that refused the write. */
  sapBrandsFailed: number;
}

/** Progress payload for client-driven chunked model import apply. */
export interface ModelImportChunkProgress {
  processed: number;
  total: number;
  nextOffset: number;
  done: boolean;
  /**
   * Which half of the apply this chunk did. The ISMS writes run first and in full;
   * the SAP brand push follows on the same offset timeline.
   */
  phase: "database" | "sap";
  /** Counts written in this chunk only — client accumulates across the loop. */
  modelsCreated: number;
  modelsUpdated: number;
  brandsCreated: number;
  seriesCreated: number;
  /** SAP `U_Brand` outcomes for this chunk only — also accumulated by the client. */
  sapBrandsUpdated: number;
  sapBrandsMatched: number;
  sapBrandsMissing: number;
  sapBrandsFailed: number;
  /** Capped sample of the chunk's failures, for the summary the user sees. */
  sapBrandFailures: ModelImportSapFailure[];
  /**
   * The SAP push stopped early and every remaining row was left alone — no
   * connection, or the company database has no such UDF. The ISMS import still
   * finished; this is a warning, never an error.
   */
  sapBrandNotice?: string;
  /** Present on the final chunk. */
  modelsUnchanged?: number;
  /** Present only when the final chunk succeeds. */
  result?: ModelImportResult;
  /** Echoed back so the client keeps addressing the same cached plan. */
  planKey?: string;
  /**
   * The cached plan is gone (cold instance or expired TTL). Nothing was written for
   * this chunk — retry the same offset with the workbook attached.
   */
  planExpired?: boolean;
}
