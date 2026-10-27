/** Shown when the receiving branch belongs to a different dealer than the releasing branch. */
export const DIFFERENT_DEALER_GROUP_MESSAGE =
  "This branch is outside your dealer group";

/**
 * A branch's dealer is Branch.dealerId (the Dealer record, such as Tiongsan or Abenson).
 * Both branches must have a dealer, and it must be the same one.
 */
export function sameDealerGroup(
  fromDealerId: string | null | undefined,
  toDealerId: string | null | undefined,
): boolean {
  return Boolean(fromDealerId) && fromDealerId === toDealerId;
}

/** Release slip keeps the transfer number. The delivery receipt is issued beside it. */
export function transferSlipNumbers(transferNo: string): { rsNo: string; drNo: string } {
  const suffix = transferNo.startsWith("XFR-") ? transferNo.slice(4) : transferNo;
  return { rsNo: transferNo, drNo: `DR-${suffix}` };
}
