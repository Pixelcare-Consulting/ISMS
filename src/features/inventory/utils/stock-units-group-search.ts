/** Trimmed global search for grouped Stock Units (serial / SKU / model / branch). */
export function normalizeStockUnitsGroupSearch(q?: string): string | undefined {
  const trimmed = q?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

/** ILIKE pattern; caller must use parameterized SQL, not string concat. */
export function stockUnitsGroupSearchPattern(q?: string): string | undefined {
  const normalized = normalizeStockUnitsGroupSearch(q);
  if (!normalized) return undefined;
  return `%${normalized.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
}
