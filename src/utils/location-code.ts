/**
 * Location codes are unique per warehouse or service center, ignoring case and surrounding
 * spaces, so "a1" and "A1 " are the same bin. Names may repeat. Shared by the locations
 * dialog (inline message) and the services (the rule itself).
 */
export function sameLocationCode(left: string, right: string): boolean {
  return left.trim().toUpperCase() === right.trim().toUpperCase();
}

/** `owner` names what holds the locations, e.g. "warehouse" or "service center". */
export function duplicateLocationCodeMessage(code: string, owner = "warehouse"): string {
  return `Location code ${code.trim()} already exists in this ${owner}.`;
}
