import type { OrderWorksheetSummary } from "@/features/orders/types/order-analytics";
import type { WorksheetOrderTotals } from "@/features/orders/lib/order-worksheet-filters";

export const ORDER_REVIEW_SNAPSHOT_KIND = "order-review-snapshot" as const;

export const APPROVED_BEFORE_REVIEW_RECORD = "Approved before this review record.";

export interface OrderReviewSnapshot {
  kind: typeof ORDER_REVIEW_SNAPSHOT_KIND;
  version: 1;
  computedDii: number | null;
  diiUnavailableReason: string | null;
  inventoryAmount: number;
  salesPeriodLabel: string;
  inventoryAsOf: string;
  metricScopeLabel: string;
  branchScopeLabel: string;
  brandScopeLabel: string;
  salesUnavailable: boolean;
  salesAmount: number | null;
  salesQty: number | null;
  requestedAmount: number;
  requestedCbm: number;
  approvedAmount: number;
  approvedCbm: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function buildOrderReviewSnapshot(
  summary: OrderWorksheetSummary,
  totals: WorksheetOrderTotals,
): OrderReviewSnapshot {
  return {
    kind: ORDER_REVIEW_SNAPSHOT_KIND,
    version: 1,
    computedDii: summary.computedDii,
    diiUnavailableReason: summary.diiUnavailableReason,
    inventoryAmount: summary.inventoryAmount,
    salesPeriodLabel: summary.salesPeriodLabel,
    inventoryAsOf: summary.inventoryAsOf,
    metricScopeLabel: summary.metricScopeLabel,
    branchScopeLabel: summary.branchScopeLabel,
    brandScopeLabel: summary.brandScopeLabel,
    salesUnavailable: summary.salesUnavailable,
    salesAmount: summary.salesAmount,
    salesQty: summary.salesQty,
    requestedAmount: totals.requestedAmount,
    requestedCbm: totals.requestedCbm,
    approvedAmount: totals.approvedAmount,
    approvedCbm: totals.approvedCbm,
  };
}

export function readOrderReviewSnapshot(value: unknown): OrderReviewSnapshot | null {
  if (!isRecord(value)) return null;
  if (value.kind !== ORDER_REVIEW_SNAPSHOT_KIND || value.version !== 1) return null;
  if (typeof value.salesPeriodLabel !== "string") return null;
  if (typeof value.inventoryAsOf !== "string") return null;
  if (typeof value.metricScopeLabel !== "string") return null;
  if (typeof value.inventoryAmount !== "number" || !Number.isFinite(value.inventoryAmount)) {
    return null;
  }
  return {
    kind: ORDER_REVIEW_SNAPSHOT_KIND,
    version: 1,
    computedDii: numberOrNull(value.computedDii),
    diiUnavailableReason: stringOrNull(value.diiUnavailableReason),
    inventoryAmount: value.inventoryAmount,
    salesPeriodLabel: value.salesPeriodLabel,
    inventoryAsOf: value.inventoryAsOf,
    metricScopeLabel: value.metricScopeLabel,
    branchScopeLabel:
      typeof value.branchScopeLabel === "string" ? value.branchScopeLabel : "",
    brandScopeLabel: typeof value.brandScopeLabel === "string" ? value.brandScopeLabel : "",
    salesUnavailable: value.salesUnavailable === true,
    salesAmount: numberOrNull(value.salesAmount),
    salesQty: numberOrNull(value.salesQty),
    requestedAmount: numberOrNull(value.requestedAmount) ?? 0,
    requestedCbm: numberOrNull(value.requestedCbm) ?? 0,
    approvedAmount: numberOrNull(value.approvedAmount) ?? 0,
    approvedCbm: numberOrNull(value.approvedCbm) ?? 0,
  };
}

export function worksheetSummaryMode(
  status: string,
  value: unknown,
): {
  mode: "current" | "snapshot" | "missing-snapshot";
  snapshot: OrderReviewSnapshot | null;
} {
  if (status !== "approved") return { mode: "current", snapshot: null };
  const snapshot = readOrderReviewSnapshot(value);
  if (!snapshot) return { mode: "missing-snapshot", snapshot: null };
  return { mode: "snapshot", snapshot };
}
