/**
 * Workbook contract for the bulk branch import.
 *
 * Sheet 1 (Branches) — form-aligned columns (sap_code, branch_name, dealer, geo,
 * alternates, schedule, …). Also accepts a single-sheet PSG ISMS export (sheet
 * named ISMS or first sheet with BRANCH CODE / AREA / STATUS headers).
 *
 * Optional legacy sheet (Allowed Models) — sap_code, sku_code. Still parsed/applied
 * when present in an older file; the download template no longer includes it.
 *
 * Unknown sap_codes are created; existing ones are updated. Allowed Models still
 * require existing product models (SKUs).
 */

export const BRANCH_SHEET_NAME = "Branches";
export const ALLOWED_MODEL_SHEET_NAME = "Allowed Models";

export const BRANCH_SHEET_HEADERS = [
  "sap_code",
  "branch_name",
  "status",
  "dealer",
  "primary_warehouse",
  "branch_area",
  "area",
  "region",
  "province",
  "alternate_branches",
  "frequency_code",
  "delivery_days",
  "order_days",
  "schedule_notes",
] as const;

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
  status: "status",
  dealer: "dealer",
  dealersapcode: "dealer",
  dealername: "dealer",
  primarywarehouse: "primarywarehouse",
  warehouse: "primarywarehouse",
  warehousecode: "primarywarehouse",
  brancharea: "brancharea",
  area: "area",
  region: "region",
  province: "province",
  alternatebranches: "alternatebranches",
  alternates: "alternatebranches",
  frequencycode: "frequencycode",
  frequency: "frequencycode",
  deliverydays: "deliverydays",
  orderdays: "orderdays",
  schedulenotes: "schedulenotes",
  notes: "schedulenotes",
  devantquota: "devantquota",
  hisenseblquota: "hisenseblquota",
  hisensewlquota: "hisensewlquota",
  hisensequota: "hisensequota",
};

/** Branch fields the import may change, and how they read in the preview. */
export const BRANCH_IMPORT_FIELD_LABELS: Record<string, string> = {
  name: "Name",
  status: "Status",
  dealer: "Dealer",
  primaryWarehouse: "Primary warehouse",
  branchArea: "Branch area",
  area: "Area",
  region: "Region",
  province: "Province",
  alternateBranches: "Alternate branches",
  frequencyCode: "Frequency code",
  deliveryDays: "Delivery days",
  orderDays: "Order days",
  scheduleNotes: "Schedule notes",
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
