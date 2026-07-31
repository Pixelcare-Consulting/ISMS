/**
 * Workbook contract for the bulk branch import.
 *
 * Sheet 1 (Branches)       — sap_code, branch_name (+ optional PSG: AREA, STATUS, quotas)
 * Sheet 2 (Allowed Models) — sap_code, sku_code
 *
 * Also accepts a single-sheet PSG ISMS export (sheet named ISMS or first sheet with
 * BRANCH CODE / AREA / STATUS headers). Unknown sap_codes are created; existing
 * ones are updated. Allowed Models still require existing product models (SKUs).
 */

export const BRANCH_SHEET_NAME = "Branches";
export const ALLOWED_MODEL_SHEET_NAME = "Allowed Models";

export const BRANCH_SHEET_HEADERS = ["sap_code", "branch_name"];
export const ALLOWED_MODEL_SHEET_HEADERS = ["sap_code", "sku_code"];

/** Normalized header → canonical key, so "SAP Code"/"sap_code"/"sapcode" all match. */
export const BRANCH_IMPORT_ALIAS_MAP: Record<string, string> = {
  sapcode: "sapcode",
  branchcode: "sapcode",
  branchsapcode: "sapcode",
  branchname: "branchname",
  name: "branchname",
  branch: "branchname",
  skucode: "skucode",
  sku: "skucode",
  modelcode: "skucode",
  modelsku: "skucode",
  area: "area",
  status: "status",
  devantquota: "devantquota",
  hisenseblquota: "hisenseblquota",
  hisensewlquota: "hisensewlquota",
  hisensequota: "hisensequota",
};

/** Branch fields the import may change, and how they read in the preview. */
export const BRANCH_IMPORT_FIELD_LABELS: Record<string, string> = {
  name: "Name",
  status: "Status",
  area: "Area",
  devantQuota: "Devant quota",
  hisenseQuota: "Hisense quota",
};

export interface BranchImportRowError {
  /** Sheet the problem is on, so the message can point at the right tab. */
  sheet: string;
  rowNumber: number;
  sapCode: string;
  message: string;
}

export interface BranchImportFieldChange {
  field: string;
  label: string;
  from: string;
  to: string;
}

export interface BranchImportBranchPlan {
  /** Existing branch id, or empty when this row will create a new branch. */
  branchId: string;
  sapCode: string;
  name: string;
  isCreate: boolean;
  changes: BranchImportFieldChange[];
  allowedModelsToAdd: { modelId: string; skuCode: string; name: string }[];
  /** Listed in the sheet but already allowed — reported as "no change". */
  allowedModelsAlreadyPresent: number;
}

export interface BranchImportPreview {
  branchRowCount: number;
  allowedModelRowCount: number;
  /** Only branches with something to do. */
  branches: BranchImportBranchPlan[];
  unchangedCount: number;
  branchCreateCount: number;
  branchUpdateCount: number;
  allowedModelAddCount: number;
  errors: BranchImportRowError[];
  canApply: boolean;
}

export interface BranchImportResult {
  branchesCreated: number;
  branchesUpdated: number;
  allowedModelsAdded: number;
  unchanged: number;
}
