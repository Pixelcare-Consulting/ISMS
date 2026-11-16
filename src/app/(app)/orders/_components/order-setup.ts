/** A branch order's setup, chosen in the Create Order popup. */
export interface OrderSetupChoice {
  /** Empty for outright: the SO bills the branch's BP Code, not a dealer. */
  dealerId: string;
  branchId: string;
  modeOfPaymentId: string;
}

/** The create page URL that opens straight on the order for `choice`. */
export function orderSetupHref(choice: OrderSetupChoice): string {
  const params = new URLSearchParams();
  if (choice.dealerId) params.set("dealerId", choice.dealerId);
  params.set("branchId", choice.branchId);
  if (choice.modeOfPaymentId) params.set("modeOfPaymentId", choice.modeOfPaymentId);
  params.set("ready", "1");
  return `/orders/manual/new?${params.toString()}`;
}
