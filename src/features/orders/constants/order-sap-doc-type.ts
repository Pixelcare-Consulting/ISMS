import {
  MODE_OF_PAYMENT_KIND_LABELS,
  type ModeOfPaymentKindValue,
} from "@/features/lookups/constants/mode-of-payment-kind";

export type OrderSapDocType = "ITR" | "SO";

/** UI labels for the SAP document an approved branch order becomes. */
export const SAP_ORDER_DOC_TYPE_LABELS: Record<OrderSapDocType, string> = {
  ITR: "ITR (Consignment)",
  SO: "SO (Outright)",
};

/**
 * The mode of payment an order uses: its own override, else the dealer's.
 * "Consignment (order override)", "Outright", or "—" when neither is set.
 */
export function formatOrderModeOfPayment(input: {
  orderModeOfPayment: string | null;
  dealerModeOfPayment: string | null;
}): string {
  if (input.orderModeOfPayment) return `${input.orderModeOfPayment} (order override)`;
  return input.dealerModeOfPayment ?? "—";
}

interface ModeOfPaymentRef {
  name: string;
  kind?: ModeOfPaymentKindValue | null;
}

/** The mode of payment an order actually uses, as `resolveOrderModeOfPayment` returns it. */
export interface ResolvedOrderModeOfPayment {
  name: string;
  kind: ModeOfPaymentKindValue | null;
  /** True when the order overrides its dealer's mode of payment. */
  override: boolean;
}

/**
 * The mode of payment an order actually uses: its own override, else the dealer's.
 * Null when neither is set. `kind` is null when the mode of payment is not classified yet.
 */
export function resolveOrderModeOfPayment(input: {
  orderModeOfPayment: ModeOfPaymentRef | null | undefined;
  dealerModeOfPayment: ModeOfPaymentRef | null | undefined;
}): ResolvedOrderModeOfPayment | null {
  const chosen = input.orderModeOfPayment ?? input.dealerModeOfPayment;
  if (!chosen) return null;
  return { name: chosen.name, kind: chosen.kind ?? null, override: Boolean(input.orderModeOfPayment) };
}

/** "Consignment COD", so a table search finds orders by kind or by mode of payment name. */
export function orderModeOfPaymentSearchText(resolved: ResolvedOrderModeOfPayment | null): string {
  if (!resolved) return "";
  return [resolved.kind ? MODE_OF_PAYMENT_KIND_LABELS[resolved.kind] : "", resolved.name].join(" ");
}

/** The SAP document an order shows as two fields: what it is, and its number in SAP. */
export interface OrderSapDocumentFields {
  /** "ITR (Consignment)", or "—" before approval decides it. */
  type: string;
  /** "ITR no." / "SO no.", or "SAP document no." while the type is unknown. */
  numberLabel: string;
  /** SAP's DocNum, or "—" until SAP has posted the document. */
  number: string;
}

export function orderSapDocumentFields(order: {
  sapDocType: OrderSapDocType | null;
  sapDocNum: number | null;
}): OrderSapDocumentFields {
  return {
    type: order.sapDocType ? SAP_ORDER_DOC_TYPE_LABELS[order.sapDocType] : "—",
    numberLabel: order.sapDocType ? `${order.sapDocType} no.` : "SAP document no.",
    number: order.sapDocNum != null ? String(order.sapDocNum) : "—",
  };
}
