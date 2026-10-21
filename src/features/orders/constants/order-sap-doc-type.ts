export type OrderSapDocType = "ITR" | "SO";

/** UI labels for the SAP document an approved branch order becomes. */
export const SAP_ORDER_DOC_TYPE_LABELS: Record<OrderSapDocType, string> = {
  ITR: "ITR (Consignment)",
  SO: "SO (Outright)",
};

/** "ITR (Consignment) · 1234", or "—" when the order has no document type yet. */
export function formatOrderSapDocument(order: {
  sapDocType: OrderSapDocType | null;
  sapDocNum: number | null;
}): string {
  if (!order.sapDocType) return "—";
  const label = SAP_ORDER_DOC_TYPE_LABELS[order.sapDocType];
  return order.sapDocNum != null ? `${label} · ${order.sapDocNum}` : label;
}
