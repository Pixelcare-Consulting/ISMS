/**
 * A quantity field shows 0 as empty (the placeholder reads 0). Showing a literal 0 made
 * typing "5" read "05", because a number input keeps what was typed when the number is the
 * same, and clearing the field snapped straight back to 0.
 */
export function qtyInputValue(value: number | null | undefined): number | "" {
  return value != null && value > 0 ? value : "";
}

/** An emptied field is 0; anything else is a whole, non-negative quantity. */
export function parseQtyInput(raw: string): number {
  if (raw.trim() === "") return 0;
  const parsed = Math.trunc(Number(raw));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
