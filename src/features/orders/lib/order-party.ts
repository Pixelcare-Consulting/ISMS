import type { ModeOfPaymentKindValue } from "@/features/lookups/constants/mode-of-payment-kind";
import { noBranchBpCode } from "@/features/orders/services/order-sap-routing";

/**
 * Who an order is for, chosen mode of payment first: consignment goes Dealer → Branch
 * (ITR), outright goes straight to a Branch and bills its BP Code (SO), so outright
 * never asks for a dealer and a BP-Code branch can never end up on a consignment order.
 */

export interface OrderModeOfPaymentOption {
  id: string;
  name: string;
  kind: ModeOfPaymentKindValue | null;
}

export interface OrderDealerOption {
  id: string;
  name: string;
  modeOfPaymentId: string | null;
}

export interface OrderBranchOption {
  id: string;
  name: string;
  sapCode: string;
  /** SAP customer an outright SO bills. Null until set in SAP and synced. */
  bpCode: string | null;
  dealerId: string | null;
}

/**
 * The dealer filter for the branch list: `null` while the list can't load yet (no mode
 * of payment, or consignment without a dealer), `""` for every branch (outright).
 */
export function branchDealerFilter(
  kind: ModeOfPaymentKindValue | null,
  dealerId: string,
): string | null {
  if (kind === "OUTRIGHT") return "";
  if (kind === "CONSIGNMENT" && dealerId) return dealerId;
  return null;
}

/** Why the order can't continue yet, or null when the mode of payment, dealer and branch fit. */
export function orderPartyBlock(input: {
  kind: ModeOfPaymentKindValue | null;
  dealerId: string;
  branch: Pick<OrderBranchOption, "name" | "sapCode" | "bpCode"> | null;
}): string | null {
  if (!input.kind) return "Select a mode of payment.";
  if (input.kind === "CONSIGNMENT" && !input.dealerId) return "Select a dealer.";
  if (!input.branch) return "Select a branch.";
  if (input.kind === "OUTRIGHT" && !input.branch.bpCode) return noBranchBpCode(input.branch);
  return null;
}
