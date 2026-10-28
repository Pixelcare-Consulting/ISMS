import type {
  DeliveryReturnStatus,
  DeliveryTransferLineStatus,
  DeliveryTransferStatus,
} from "@prisma/client";

import type { StatusColorKey } from "@/features/reason-status/constants/status-colors";

/** UI copy for delivery-flow enums. Backend values stay UPPERCASE. */

export const DELIVERY_TRANSFER_STATUS_LABELS: Record<DeliveryTransferStatus, string> = {
  PENDING_APPROVAL: "Pending approval",
  IN_TRANSIT: "In transit",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const DELIVERY_TRANSFER_STATUS_COLORS: Record<DeliveryTransferStatus, StatusColorKey> = {
  PENDING_APPROVAL: "amber",
  IN_TRANSIT: "sky",
  COMPLETED: "emerald",
  CANCELLED: "slate",
};

export const DELIVERY_TRANSFER_LINE_STATUS_LABELS: Record<DeliveryTransferLineStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REMOVED: "Removed",
  RECEIVED: "Received",
};

export const DELIVERY_TRANSFER_LINE_STATUS_COLORS: Record<DeliveryTransferLineStatus, StatusColorKey> = {
  PENDING: "amber",
  APPROVED: "sky",
  REMOVED: "slate",
  RECEIVED: "emerald",
};

export const DELIVERY_RETURN_STATUS_LABELS: Record<DeliveryReturnStatus, string> = {
  PENDING_APPROVAL: "Pending approval",
  APPROVED: "Approved",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const DELIVERY_RETURN_STATUS_COLORS: Record<DeliveryReturnStatus, StatusColorKey> = {
  PENDING_APPROVAL: "amber",
  APPROVED: "sky",
  COMPLETED: "emerald",
  CANCELLED: "slate",
};

/** Shown on an approved return whose SAP document did not post. */
export function returnSapFailedMessage(sapError: string): string {
  return `SAP posting failed: ${sapError}`;
}

/** Status of an approved return's SAP post: the error, or that it has not finished. */
export function returnSapPendingMessage(sapError: string | null | undefined): string {
  return sapError ? returnSapFailedMessage(sapError) : "SAP posting has not finished yet.";
}

type ReturnRef = { status: DeliveryReturnStatus; sapError?: string | null } | null | undefined;

/** Pending approval or approved and waiting for SAP: it holds the delivery's units. */
export function isReturnOpen(latest: ReturnRef): boolean {
  return latest?.status === "PENDING_APPROVAL" || latest?.status === "APPROVED";
}

/**
 * An APPROVED return has not finished its SAP post (failed, or never ran):
 * offer "Retry SAP posting" whether or not an error was recorded.
 */
export function needsSapRetry(latest: ReturnRef): boolean {
  return latest?.status === "APPROVED";
}

/** Shown when a released consignment transfer has no SAP IT yet; receive is blocked until it posts. */
export function sapTransferNotPostedMessage(sapError: string | null): string {
  return sapError
    ? `SAP transfer not posted yet: ${sapError}. Use Retry SAP posting below.`
    : "SAP transfer not posted yet. Use Retry SAP posting below.";
}

/**
 * What ISMS calls a delivery return request: an outright (SO) delivery posts a
 * SAP Return, a consignment (ITR) one an IT back to the warehouse.
 */
export function returnRequestTerm(sapDocType: "ITR" | "SO" | null | undefined): string {
  return sapDocType === "ITR" ? "transfer request" : "return request";
}
