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
  errors: ModelImportRowError[];
  rows: ModelImportRowPlan[];
}

export interface ModelImportResult {
  modelsCreated: number;
  modelsUpdated: number;
  modelsUnchanged: number;
  brandsCreated: number;
  seriesCreated: number;
}

/** Progress payload for client-driven chunked model import apply. */
export interface ModelImportChunkProgress {
  processed: number;
  total: number;
  nextOffset: number;
  done: boolean;
  /** Counts written in this chunk only — client accumulates across the loop. */
  modelsCreated: number;
  modelsUpdated: number;
  brandsCreated: number;
  seriesCreated: number;
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
