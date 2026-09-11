/**
 * Workbook contract for bulk price-list import (Master data → Price lists).
 *
 * Sheet "Price lists" — one row per SKU + package (or none) + period.
 * SKUs and package types must already exist. Matching keys update amount;
 * unchanged amounts are skipped. Nothing is deleted.
 *
 * `model_name` is filled on download for readability and ignored on upload.
 */

export const PRICE_LIST_SHEET_NAME = "Price lists";

export const PRICE_LIST_SHEET_HEADERS = [
  "sku",
  "model_name",
  "amount",
  "period_start",
  "period_end",
  "package_type",
] as const;

/** Normalized header → canonical key for our template columns only. */
export const PRICE_LIST_IMPORT_ALIAS_MAP: Record<string, string> = {
  sku: "sku",
  skucode: "sku",
  modelname: "model_name",
  model_name: "model_name",
  amount: "amount",
  srp: "amount",
  price: "amount",
  periodstart: "period_start",
  period_start: "period_start",
  start: "period_start",
  periodend: "period_end",
  period_end: "period_end",
  end: "period_end",
  packagetype: "package_type",
  package_type: "package_type",
  package: "package_type",
};

export const PRICE_LIST_IMPORT_REQUIRED_COLUMNS = [
  "sku",
  "amount",
  "period_start",
  "period_end",
] as const;

export const PRICE_LIST_IMPORT_FIELD_LABELS: Record<string, string> = {
  amount: "Amount",
};

export interface PriceListImportRowError {
  sheet: string;
  rowNumber: number;
  sku: string;
  message: string;
}

export interface PriceListImportFieldChange {
  field: string;
  label: string;
  from: string;
  to: string;
}

export type PriceListImportRowAction = "create" | "update" | "skip";

export interface PriceListImportRowPlan {
  rowNumber: number;
  sku: string;
  modelName: string;
  amount: number;
  periodStart: string;
  periodEnd: string;
  packageTypeName: string | null;
  action: PriceListImportRowAction;
  changes: PriceListImportFieldChange[];
}

export interface PriceListImportPreview {
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
  errors: PriceListImportRowError[];
  rows: PriceListImportRowPlan[];
}

export interface PriceListImportResult {
  created: number;
  updated: number;
  unchanged: number;
}

/** Progress payload for client-driven chunked price-list import apply. */
export interface PriceListImportChunkProgress {
  processed: number;
  total: number;
  nextOffset: number;
  done: boolean;
  /** Counts written in this chunk only — client accumulates across the loop. */
  created: number;
  updated: number;
  /** Present on every chunk from the pre-write plan. */
  unchanged?: number;
  /** Present only when the final chunk succeeds. */
  result?: PriceListImportResult;
  /** Echoed back so the client keeps addressing the same cached plan. */
  planKey?: string;
  /**
   * The cached plan is gone (cold instance or expired TTL). Nothing was written for
   * this chunk — retry the same offset with the workbook attached.
   */
  planExpired?: boolean;
}
