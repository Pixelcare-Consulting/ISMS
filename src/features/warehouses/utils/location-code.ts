/**
 * Location codes are unique per warehouse, ignoring case and surrounding spaces, so "a1"
 * and "A1 " are the same bin. Names may repeat. Shared by the dialog (inline message) and
 * the service (the rule itself).
 */
export function sameLocationCode(left: string, right: string): boolean {
  return left.trim().toUpperCase() === right.trim().toUpperCase();
}

export function duplicateLocationCodeMessage(code: string): string {
  return `Location code ${code.trim()} already exists in this warehouse.`;
}
