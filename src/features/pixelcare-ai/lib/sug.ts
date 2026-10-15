/**
 * Shelf gap / SUG — same as Planogram UI and order analytics:
 * Suggested order qty / SUG = Shelf max − on-hand (STK)
 * (= Math.max(0, shelfMax − STK); internal field is still maxQty).
 */
export function computeSugQty(maxQty: number, stkQty: number): number {
  return Math.max(0, maxQty - stkQty);
}
