/** Branch sales transaction number prefix (unique per tenant). */
export const SALE_TRANSACTION_NO_PREFIX = "TRN-";

export function generateSaleTransactionNo(now = Date.now()): string {
  return `${SALE_TRANSACTION_NO_PREFIX}${now.toString(36).toUpperCase()}`;
}

export function isSaleTransactionNo(value: string): boolean {
  return (
    value.startsWith(SALE_TRANSACTION_NO_PREFIX) &&
    value.length > SALE_TRANSACTION_NO_PREFIX.length
  );
}
