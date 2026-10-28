import type { OrderSapDocType } from "@/features/orders/constants/order-sap-doc-type";
import { FOLLOWED_KIND_FOR_ORDER } from "@/features/logistics/services/sap-copy-to-follow.planner";

/** Column and field label for a delivery's SAP document number. */
export const SAP_DOC_NO_LABEL = "SAP doc#";
export const SAP_DOC_DATE_LABEL = "SAP doc date";

/**
 * "DR: 12345" (A/R Delivery, from an SO) or "IT: 6789" (Inventory Transfer, from an ITR),
 * so users know which SAP module to search. Left as is when the order type is unknown.
 */
export function formatSapDocNo(
  docNo: string | null | undefined,
  orderSapDocType: OrderSapDocType | null | undefined,
): string | null {
  const value = docNo?.trim();
  if (!value) return null;
  return orderSapDocType ? `${FOLLOWED_KIND_FOR_ORDER[orderSapDocType]}: ${value}` : value;
}

/**
 * Prefix for the SAP document an approved reject request posts, by the delivery's order type.
 * Outright is a Return (ORDN), a separate number series from Deliveries: "Delivery: 14402"
 * pointed at an unrelated DR with the same number.
 */
const REJECT_SAP_DOC_PREFIX: Record<OrderSapDocType, string> = {
  ITR: "IT",
  SO: "Return",
};

/**
 * "IT: 494405" (consignment: Inventory Transfer back to the warehouse) or
 * "Return: 14402" (outright: Return on the DR). Left as is when the order type is unknown.
 */
export function formatRejectSapDocNo(
  docNo: string | null | undefined,
  orderSapDocType: OrderSapDocType | null | undefined,
): string | null {
  const value = docNo?.trim();
  if (!value) return null;
  return orderSapDocType ? `${REJECT_SAP_DOC_PREFIX[orderSapDocType]}: ${value}` : value;
}
