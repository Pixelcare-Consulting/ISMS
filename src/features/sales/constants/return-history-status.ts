import { isServiceDocumentTypeName } from "@/features/sales/constants/process-return";

/** Product status kept on a normal sales return or replacement. */
export const RETURNED_REPLACED_STATUS = "Returned/Replaced";

/** Product status kept on a service return or replacement. */
export const SERVICE_RETURNED_REPLACED_STATUS = "Service Returned/Replaced";

/**
 * Return-request steps during which the sale keeps the product status above.
 * Rejected sales go back to their sale status. Later steps must not clear this.
 */
const RETURN_HISTORY_STATUSES = new Set([
  "pending_cs",
  "pending_tl",
  "approved",
  "completed",
]);

export function isReturnHistoryStatus(
  status: string | null | undefined,
): boolean {
  return status != null && RETURN_HISTORY_STATUSES.has(status);
}

/** A return without a line id covers the sale; otherwise only that line. */
export function returnRequestAppliesToLine(
  saleDetailId: string | null | undefined,
  lineId: string,
): boolean {
  return saleDetailId == null || saleDetailId === lineId;
}

export function returnHistoryStatusLabel(service: boolean): string {
  return service ? SERVICE_RETURNED_REPLACED_STATUS : RETURNED_REPLACED_STATUS;
}

export interface ReturnHistoryStatusRef {
  code: string;
  name: string;
  color: string;
}

/**
 * Stable sale status for a return that is requested, approved, or finished.
 * Null when there is no return, or the request was rejected.
 */
export function returnHistoryStatusRef(
  status: string | null | undefined,
  documentTypeName: string | null | undefined,
): ReturnHistoryStatusRef | null {
  if (!isReturnHistoryStatus(status)) return null;
  const service = isServiceDocumentTypeName(documentTypeName);
  return {
    code: service ? "service_returned_replaced" : "returned_replaced",
    name: returnHistoryStatusLabel(service),
    color: service ? "teal" : "violet",
  };
}
