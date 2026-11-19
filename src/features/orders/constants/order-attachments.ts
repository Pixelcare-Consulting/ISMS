import type { BranchOrderStatus } from "@prisma/client";

/** Files cannot be added once the order is closed. */
export const ORDER_ATTACHMENT_CLOSED_STATUSES: readonly BranchOrderStatus[] = [
  "approved",
  "rejected",
  "cancelled",
];

/** A file attached to an order, as order pages list it. */
export interface OrderAttachmentSummary {
  id: string;
  fileName: string;
}

export function orderAttachmentHref(attachmentId: string): string {
  return `/api/orders/attachments/${encodeURIComponent(attachmentId)}`;
}

/** Authenticated preview URL for a path stored on the order (by list index). */
export function orderAttachmentFileHref(orderId: string, index: number): string {
  return `/api/orders/${encodeURIComponent(orderId)}/attachments?index=${index}`;
}
