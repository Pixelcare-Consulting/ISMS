/** Document Type names that route to Service Returns + unlock Process Return service extras. */
export const SERVICE_DOCUMENT_TYPE_NAMES = [
  "service return",
  "service returns",
  "service replacement",
  "service replacements",
] as const;

/** Document Type names that require Team Leader approve after CS evaluate. */
export const DEALER_INITIATED_DOCUMENT_TYPE_NAMES = [
  "dealer initiated return",
  "dealer initiated returns",
  "dealer initiated replacement",
  "dealer initiated replacements",
] as const;

/** Document Type names that unlock Service Return extras (case-insensitive). */
export function isServiceDocumentTypeName(
  name: string | null | undefined,
): boolean {
  const normalized = name?.trim().toLowerCase() ?? "";
  return (SERVICE_DOCUMENT_TYPE_NAMES as readonly string[]).includes(
    normalized,
  );
}

/** Dealer Initiated Return / Replacement — CS evaluate goes to pending_tl. */
export function isDealerInitiatedDocumentTypeName(
  name: string | null | undefined,
): boolean {
  const normalized = name?.trim().toLowerCase() ?? "";
  return (DEALER_INITIATED_DOCUMENT_TYPE_NAMES as readonly string[]).includes(
    normalized,
  );
}

/** @deprecated Prefer {@link isServiceDocumentTypeName}. */
export function isServiceReturnDocumentTypeName(
  name: string | null | undefined,
): boolean {
  return isServiceDocumentTypeName(name);
}

export const RETURN_STOCK_STATUS_OPTIONS = [
  { value: "STK", label: "STK — Stock" },
  { value: "DEF", label: "DEF — Defective" },
] as const;

export type ReturnStockStatusValue =
  (typeof RETURN_STOCK_STATUS_OPTIONS)[number]["value"];

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
