/**
 * Pure validation helpers for branch-quota import rows.
 * Kept separate from the service so unit tests do not need Prisma / ExcelJS.
 */

export function lookupKey(value: string): string {
  return value.trim().toLowerCase();
}

export function isBlankOrDash(value: string | undefined | null): boolean {
  if (value == null) return true;
  const trimmed = value.trim();
  return !trimmed || trimmed === "-";
}

/**
 * Parse month as YYYY-MM or YYYY-MM-DD → first-of-month UTC Date + display YYYY-MM.
 * Rejects invalid calendars (e.g. 2026-13).
 */
export function parseImportMonth(
  raw: string | undefined,
): { monthLabel: string; quotaDate: Date } | { error: string } {
  if (raw == null || isBlankOrDash(raw)) {
    return { error: "month is empty (use YYYY-MM)." };
  }

  let text = raw.trim();

  // Excel serial / ISO leftovers after workbook cell formatting.
  const isoMatch = /^(\d{4})-(\d{2})(?:-(\d{2}))?(?:T.*)?$/.exec(text);
  if (isoMatch) {
    text = `${isoMatch[1]}-${isoMatch[2]}`;
  }

  const match = /^(\d{4})-(\d{2})$/.exec(text);
  if (!match) {
    return { error: `Invalid month "${raw.trim()}" (use YYYY-MM).` };
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) {
    return { error: `Invalid month "${raw.trim()}" (use YYYY-MM).` };
  }

  const quotaDate = new Date(Date.UTC(year, monthIndex, 1));
  if (
    quotaDate.getUTCFullYear() !== year ||
    quotaDate.getUTCMonth() !== monthIndex
  ) {
    return { error: `Invalid month "${raw.trim()}" (use YYYY-MM).` };
  }

  return {
    monthLabel: `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
    quotaDate,
  };
}

/** Parse a positive quota amount (commas allowed). */
export function parseImportQuotaAmount(
  raw: string | undefined,
): { amount: number } | { error: string } {
  if (raw == null || isBlankOrDash(raw)) {
    return { error: "quota_amount is empty." };
  }
  const normalized = raw.replace(/,/g, "").trim();
  const amount = Number.parseFloat(normalized);
  if (!Number.isFinite(amount)) {
    return { error: `Invalid quota_amount "${raw.trim()}".` };
  }
  if (amount <= 0) {
    return { error: "quota_amount must be greater than 0." };
  }
  return { amount };
}

/** Stable unique key for branch + brand + month within a file / DB. */
export function quotaImportUniqueKey(
  branchId: string,
  brandId: string,
  monthLabel: string,
): string {
  return `${branchId}|${brandId}|${monthLabel}`;
}

export function formatQuotaAmount(value: number | string): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return String(n);
}
