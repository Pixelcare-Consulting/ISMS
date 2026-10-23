/** Same number a new transfer shows before it is saved. */
export function nextTransferNo(): string {
  return `XFR-${Date.now().toString(36).toUpperCase()}`;
}
