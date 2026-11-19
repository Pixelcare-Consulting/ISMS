import type { ModeOfPaymentKindValue } from "@/features/lookups/constants/mode-of-payment-kind";
import { noBranchBpCode } from "@/features/orders/services/order-sap-routing";

/**
 * Who an order is for, chosen branch first: the branch names its dealer, and the dealer's
 * mode of payment is the default (the user may override it). Consignment ships to the
 * dealer's branch (ITR) so it needs a dealer; outright bills the branch's BP Code (SO).
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

/** The branch's dealer, or null when the branch has none or it is not in the list. */
export function branchDealer(
  branch: Pick<OrderBranchOption, "dealerId"> | null,
  dealers: readonly OrderDealerOption[],
): OrderDealerOption | null {
  if (!branch?.dealerId) return null;
  return dealers.find((dealer) => dealer.id === branch.dealerId) ?? null;
}

/**
 * The mode of payment a branch defaults to: its dealer's, when that mode is one the order
 * can use. Otherwise "" so the user picks one.
 */
export function defaultModeOfPaymentId(
  dealer: Pick<OrderDealerOption, "modeOfPaymentId"> | null,
  modes: readonly Pick<OrderModeOfPaymentOption, "id">[],
): string {
  const id = dealer?.modeOfPaymentId ?? "";
  return id && modes.some((mode) => mode.id === id) ? id : "";
}

/** Why the order can't continue yet, or null when the branch and mode of payment fit. */
export function orderPartyBlock(input: {
  kind: ModeOfPaymentKindValue | null;
  branch: Pick<OrderBranchOption, "name" | "sapCode" | "bpCode" | "dealerId"> | null;
}): string | null {
  if (!input.branch) return "Select a branch.";
  if (!input.kind) return "Select a mode of payment.";
  if (input.kind === "CONSIGNMENT" && !input.branch.dealerId) {
    return `${input.branch.name} has no dealer, so it can't take a consignment order. Set its dealer in Settings → Branches, or choose an outright mode of payment.`;
  }
  if (input.kind === "OUTRIGHT" && !input.branch.bpCode) return noBranchBpCode(input.branch);
  return null;
}
