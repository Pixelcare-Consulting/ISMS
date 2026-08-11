/** Document Type names that unlock Service Return extras (case-insensitive). */
export function isServiceReturnDocumentTypeName(name: string | null | undefined): boolean {
  const normalized = name?.trim().toLowerCase() ?? "";
  return normalized === "service return" || normalized === "service returns";
}

export const RETURN_STOCK_STATUS_OPTIONS = [
  { value: "STK", label: "STK — Stock" },
  { value: "DEF", label: "DEF — Defective" },
] as const;

export type ReturnStockStatusValue = (typeof RETURN_STOCK_STATUS_OPTIONS)[number]["value"];

/** Free-select options until dedicated classification lookup exists. */
export const RETURN_CLASSIFICATION_OPTIONS = [
  "Warranty",
  "Non-Warranty",
  "DOA",
  "Goodwill",
  "Other",
] as const;

export const RETURN_NATURE_OF_TRANSACTION_OPTIONS = [
  "Return",
  "Replacement",
  "Repair",
  "Exchange",
  "Other",
] as const;

export const ATR_ODRF_STORAGE_PREFIX = "returns-atr-odrf";

export function buildAtrOdrfPdfPath(input: {
  tenantId: string;
  returnRequestId: string;
}): string {
  return `${ATR_ODRF_STORAGE_PREFIX}/tenants/${input.tenantId}/returns/${input.returnRequestId}/atr-odrf.pdf`;
}

export function atrOdrfDownloadUrl(returnRequestId: string): string {
  return `/api/returns/${encodeURIComponent(returnRequestId)}/atr-odrf`;
}
