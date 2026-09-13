/**
 * Workbook contract for the bulk dealer import (Settings → Dealers).
 *
 * Sheet "Dealers" — one row per dealer, columns aligned with the Add dealer form:
 * SAP code, name, status, and the four ISMS classification lookups (area, dealer type,
 * dealer area, mode of payment) by name. Lookups must already exist — this import does
 * not create master data.
 *
 * Matching: a row with a `dealer_sap_code` matches the dealer holding that code; a row
 * without one matches by name, and fails if the name is shared by more than one dealer
 * (see the `Dealer` model for why names may repeat). Unmatched rows create. Blank cells
 * on an update leave the field as it is — nothing is ever cleared or deleted.
 */

export const DEALER_SHEET_NAME = "Dealers";

export const DEALER_SHEET_HEADERS = [
  "dealer_sap_code",
  "dealer_name",
  "status",
  "area",
  "dealer_type",
  "dealer_area",
  "mode_of_payment",
] as const;

/** Normalized header → canonical key, so "Dealer SAP Code"/"dealer_sap_code"/"sap_code" all match. */
export const DEALER_IMPORT_ALIAS_MAP: Record<string, string> = {
  sapcode: "sapcode",
  dealercode: "sapcode",
  dealersapcode: "sapcode",
  cardcode: "sapcode",
  dealername: "name",
  name: "name",
  dealer: "name",
  cardname: "name",
  status: "status",
  area: "area",
  areacode: "area",
  dealertype: "dealertype",
  type: "dealertype",
  dealerarea: "dealerarea",
  modeofpayment: "modeofpayment",
  payment: "modeofpayment",
  paymentmode: "modeofpayment",
};

export const DEALER_IMPORT_REQUIRED_COLUMNS = ["name"] as const;

/** Dealer fields the import may change, and how they read in the preview. */
export const DEALER_IMPORT_FIELD_LABELS: Record<string, string> = {
  sapCode: "SAP code",
  name: "Name",
  status: "Status",
  area: "Area",
  dealerType: "Dealer type",
  dealerArea: "Dealer area",
  modeOfPayment: "Mode of payment",
};

export interface DealerImportRowError {
  sheet: string;
  rowNumber: number;
  /** SAP code or name — whatever identifies the row to the reader. */
  dealer: string;
  message: string;
}

export interface DealerImportFieldChange {
  field: string;
  label: string;
  from: string;
  to: string;
}

export type DealerImportRowAction = "create" | "update" | "skip";

export interface DealerImportRowPlan {
  rowNumber: number;
  sapCode: string | null;
  name: string;
  action: DealerImportRowAction;
  changes: DealerImportFieldChange[];
}

export interface DealerImportPreview {
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
  errors: DealerImportRowError[];
  rows: DealerImportRowPlan[];
}

export interface DealerImportResult {
  created: number;
  updated: number;
  unchanged: number;
}

/** Progress payload for client-driven chunked dealer import apply. */
export interface DealerImportChunkProgress {
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
  result?: DealerImportResult;
  /** Echoed back so the client keeps addressing the same cached plan. */
  planKey?: string;
  /**
   * The cached plan is gone (cold instance or expired TTL). Nothing was written for
   * this chunk — retry the same offset with the workbook attached.
   */
  planExpired?: boolean;
}
