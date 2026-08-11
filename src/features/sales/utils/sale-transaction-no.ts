/** Max length for user-entered sales transaction numbers. */
export const SALE_TRANSACTION_NO_MAX_LENGTH = 100;

/** Accept any non-empty transaction number text (unique per branch within a tenant on save). */
export function isSaleTransactionNo(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= SALE_TRANSACTION_NO_MAX_LENGTH;
}
