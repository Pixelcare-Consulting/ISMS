import { isServiceDocumentTypeName } from "@/features/sales/constants/process-return";

/** Product status kept on a normal sales return. */
export const RETURNED_STATUS = "Returned";

/** Product status kept on a normal sales replacement. */
export const REPLACED_STATUS = "Replaced";

/** Product status kept on a service return. */
export const SERVICE_RETURNED_STATUS = "Service Returned";

/** Product status kept on a service replacement. */
export const SERVICE_REPLACED_STATUS = "Service Replaced";

/**
 * Combined label still shown on service-center sales, which do not split
 * return and replacement.
 */
export const RETURNED_REPLACED_STATUS = "Returned/Replaced";

/** Combined service-center label. Branch sales use the split labels above. */
export const SERVICE_RETURNED_REPLACED_STATUS = "Service Returned/Replaced";

export type ReturnHistoryAction = "return" | "replacement";

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

export function returnHistoryStatusLabel(
  service: boolean,
  actionType?: ReturnHistoryAction | null,
): string {
  if (actionType == null) {
    return service ? SERVICE_RETURNED_REPLACED_STATUS : RETURNED_REPLACED_STATUS;
  }
  switch (actionType) {
    case "return":
      return service ? SERVICE_RETURNED_STATUS : RETURNED_STATUS;
    case "replacement":
      return service ? SERVICE_REPLACED_STATUS : REPLACED_STATUS;
    default: {
      const _exhaustive: never = actionType;
      return _exhaustive;
    }
  }
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
  actionType?: ReturnHistoryAction | null,
): ReturnHistoryStatusRef | null {
  if (!isReturnHistoryStatus(status)) return null;
  const service = isServiceDocumentTypeName(documentTypeName);
  const kind: ReturnHistoryAction =
    actionType === "replacement" ? "replacement" : "return";
  switch (kind) {
    case "return":
      return {
        code: service ? "service_returned" : "returned",
        name: service ? SERVICE_RETURNED_STATUS : RETURNED_STATUS,
        color: service ? "teal" : "violet",
      };
    case "replacement":
      return {
        code: service ? "service_replaced" : "replaced",
        name: service ? SERVICE_REPLACED_STATUS : REPLACED_STATUS,
        color: service ? "teal" : "violet",
      };
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
