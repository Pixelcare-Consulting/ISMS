/**
 * Workbook contract for the bulk province import (Settings → Master data → Provinces).
 *
 * Sheet "Provinces" — one row per province: name, region (by name) and status.
 * Regions must already exist — this import does not create them.
 *
 * Matching: a row matches the province with the same name, ignoring case. Unmatched
 * rows create. Blank region/status cells on an update leave the field as it is —
 * nothing is ever cleared or deleted.
 */

export const PROVINCE_SHEET_NAME = "Provinces";

export const PROVINCE_SHEET_HEADERS = ["province_name", "region", "status"] as const;

/** Normalized header → canonical key, so "Province Name"/"province_name"/"name" all match. */
export const PROVINCE_IMPORT_ALIAS_MAP: Record<string, string> = {
  provincename: "name",
  province: "name",
  name: "name",
  region: "region",
  regionname: "region",
  status: "status",
};

export const PROVINCE_IMPORT_REQUIRED_COLUMNS = ["name"] as const;

/** A province file is a few hundred rows at most; anything bigger is the wrong file. */
export const PROVINCE_IMPORT_MAX_ROWS = 2000;

export interface ProvinceImportRowError {
  rowNumber: number;
  province: string;
  message: string;
}

export interface ProvinceImportFieldChange {
  label: string;
  from: string;
  to: string;
}

export type ProvinceImportRowAction = "create" | "update";

export interface ProvinceImportRowPlan {
  rowNumber: number;
  name: string;
  action: ProvinceImportRowAction;
  changes: ProvinceImportFieldChange[];
}

export interface ProvinceImportPreview {
  rowCount: number;
  createCount: number;
  updateCount: number;
  unchangedCount: number;
  /** Only rows that create or change something. */
  rows: ProvinceImportRowPlan[];
  errors: ProvinceImportRowError[];
  canApply: boolean;
}

export interface ProvinceImportResult {
  created: number;
  updated: number;
  unchanged: number;
}
