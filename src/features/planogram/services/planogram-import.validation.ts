/**
 * Pure validation for planogram import cells.
 * Kept separate from the service so unit tests do not need Prisma.
 */

function isBlankOrDash(value: string | undefined | null): boolean {
  if (value == null) return true;
  const trimmed = value.trim();
  return !trimmed || trimmed === "-";
}

/** Shelf max is a whole number of at least 1. "1.0" from a text cell is accepted. */
export function parsePlanogramShelfMax(
  raw: string | undefined | null,
): { maxQty: number } | { error: string } {
  if (isBlankOrDash(raw)) {
    return { error: "shelf_max is empty." };
  }
  const normalized = String(raw).replace(/,/g, "").trim();
  if (!/^\d+(?:\.0+)?$/.test(normalized)) {
    return { error: "shelf_max must be a whole number of at least 1." };
  }
  const maxQty = Number(normalized);
  if (!Number.isSafeInteger(maxQty) || maxQty < 1) {
    return { error: "shelf_max must be a whole number of at least 1." };
  }
  return { maxQty };
}
