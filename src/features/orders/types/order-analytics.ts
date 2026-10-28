import type { BranchOrderStatus, BranchOrderType, SkuStatus } from "@prisma/client";
import type {
  OrderSapDocType,
  ResolvedOrderModeOfPayment,
} from "@/features/orders/constants/order-sap-doc-type";

/** Off-planogram shelf gap. Em dash, matching the worksheet contract. */
export const OFF_PLANOGRAM_SUGGESTION_REASON = "N/A\u2014outside planogram";

/** Computed DII when the sales query succeeded and the amount is zero. */
export const NO_SALES_DII_REASON = "No sales in this period";

export const WORKSHEET_SALES_TIME_ZONE = "Asia/Manila" as const;

export const WORKSHEET_INVENTORY_AMOUNT_BASIS = "on-hand-stk-times-active-order-price" as const;

export interface OrderInventoryStatusCount {
  code: string;
  count: number;
  /** Palette key from the inventory status master (ReasonStatusCode.color). */
  color?: string | null;
}

export interface OrderAnalyticsBrand {
  id: string;
  name: string;
}

export interface OrderAnalyticsLine {
  modelId: string;
  skuCode: string;
  name: string;
  brandId: string | null;
  srp: number;
  cbm: number;
  maxQty: number;
  milDays: number;
  inventory: OrderInventoryStatusCount[];
  stkQty: number;
  ditQty: number;
  salesQty: number;
  salesAmount: number;
  rate: number | null;
  milQty: number;
  milAmt: number;
  sugQty: number;
  remainingCapacity: number;
  onPlanogram: boolean;
}

export interface OrderAnalyticsSummary {
  targetDii: number;
  computedDii: number | null;
  inventoryAmount: number;
  stkCount: number;
  ditCount: number;
}

export interface OrderAnalyticsPayload {
  branchId: string;
  branchName: string;
  dealerId: string | null;
  dealerName: string | null;
  brands: OrderAnalyticsBrand[];
  brandId: string | null;
  orderType: BranchOrderType;
  daysElapsed: number;
  summary: OrderAnalyticsSummary;
  lines: OrderAnalyticsLine[];
}

export interface OrderWorkspaceAdditionalModel {
  id: string;
  skuCode: string;
  name: string;
  brandId: string | null;
  srp: number;
  cbm: number;
  inventory: OrderInventoryStatusCount[];
  stkQty: number;
  ditQty: number;
  onPlanogram: boolean;
  remainingCapacity: number;
}

export interface OrderWorkspacePayload extends OrderAnalyticsPayload {
  windowBlocked: boolean;
  windowReason: string | null;
  additionalModels: OrderWorkspaceAdditionalModel[];
}

export type OrderWorksheetModelOrigin = "planogram" | "historical_order_line";

export type WorksheetTransitDirection = "incoming" | "outgoing" | "unclassified";

/**
 * Distinct serial counts for one model.
 * On hand is STK only. Awaiting pull-out is not added to defective.
 */
export interface OrderWorksheetInventory {
  onHandQty: number;
  availableToSellQty: number;
  defectiveQty: number;
  awaitingPulloutQty: number;
  transitIncomingQty: number;
  transitOutgoingQty: number;
  transitUnclassifiedQty: number;
  /** Incoming + outgoing + unclassified. Each DIT serial is in one bucket. */
  ditQty: number;
  byStatus: OrderInventoryStatusCount[];
}

export interface OrderWorksheetLine {
  modelId: string;
  skuCode: string;
  name: string;
  brandId: string | null;
  brandName: string | null;
  modelStatus: SkuStatus;
  origin: OrderWorksheetModelOrigin;
  /**
   * False for historical order lines that are inactive or off the planogram.
   * Active planogram rows stay true, including zero on-hand.
   */
  newlyOrderable: boolean;
  onPlanogram: boolean;
  /** False when a brand filter is on and this row's brand is different. */
  matchesBrandFilter: boolean;
  shelfMax: number | null;
  /** Active order price. Stock value uses this, not cost. */
  srp: number;
  cbm: number;
  inventory: OrderWorksheetInventory;
  salesQty: number | null;
  salesAmount: number | null;
  salesUnavailable: boolean;
  sugQty: number | null;
  suggestionUnavailableReason: string | null;
  /**
   * Usual days of cover for this model.
   * Same branch MIL setting order analytics uses. Missing settings use 30 days.
   */
  milDays: number;
  /** DIT serials coming into the branch. Not subtracted from SUG. */
  incomingQty: number;
  /**
   * Open order quantity not already received or already counted in incomingQty
   * via that order's delivery.
   */
  outstandingOrderQty: number;
}

export interface OrderWorksheetSummary {
  branchId: string;
  branchName: string;
  brandId: string | null;
  brandName: string | null;
  brandFiltered: boolean;
  branchScopeLabel: string;
  brandScopeLabel: string;
  /** Names the branch and brand whose rows feed both stock value and DII. */
  metricScopeLabel: string;
  includesHistoricalOrderLines: boolean;
  offBrandRowCount: number;
  salesTimeZone: typeof WORKSHEET_SALES_TIME_ZONE;
  salesPeriodLabel: string;
  inventoryAsOf: string;
  daysElapsed: number;
  computedDii: number | null;
  diiUnavailableReason: typeof NO_SALES_DII_REASON | null;
  inventoryAmount: number;
  inventoryAmountBasis: typeof WORKSHEET_INVENTORY_AMOUNT_BASIS;
  salesQty: number | null;
  salesAmount: number | null;
  salesUnavailable: boolean;
}

/** Current-month quantity stored on Branch Quotas for one brand. */
export interface OrderWorksheetBrandQuota {
  brandId: string;
  quantity: number;
}

export interface OrderWorksheetPayload {
  branchId: string;
  branchName: string;
  dealerId: string | null;
  dealerName: string | null;
  brands: OrderAnalyticsBrand[];
  brandId: string | null;
  orderType: BranchOrderType;
  /** Frequency code on the branch delivery schedule, such as F1. Blank when none. */
  deliveryFrequencyCode: string | null;
  /** One current-month quota per brand. Empty when the branch has none. */
  brandQuotas: OrderWorksheetBrandQuota[];
  lines: OrderWorksheetLine[];
  summary: OrderWorksheetSummary;
}

export interface OrderWorksheetInput {
  branchId: string;
  brandId?: string | null;
  orderType: BranchOrderType;
  /** Models already on the order. Kept even when inactive or off the planogram. */
  existingModelIds?: readonly string[];
  /**
   * Leave this order's quantity out of outstandingOrderQty.
   * In-transit serials on its delivery still count as incoming.
   */
  excludeOrderId?: string | null;
}

export interface OrderHistoryLine {
  detailId: string;
  modelId: string;
  skuCode: string;
  name: string;
  quantity: number;
  approvedQty: number | null;
  remarks: string | null;
  spRemarks: string | null;
}

export interface OrderHistoryApproval {
  level: number;
  roleSlug: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  comment: string | null;
  approvedBy: { name: string | null; email: string } | null;
}

export interface OrderHistoryRow {
  id: string;
  orderNumber: string;
  orderType: BranchOrderType;
  status: string;
  branchId: string;
  branchName: string;
  brandId: string | null;
  notes: string | null;
  deliveryDueDate: string | null;
  createdByName: string;
  reviewSnapshot: unknown;
  reviewSnapshotAt: string | null;
  sapDocType: OrderSapDocType | null;
  sapDocNum: number | null;
  /** The mode of payment the order uses (its own, else the dealer's). Null when neither is set. */
  modeOfPayment: ResolvedOrderModeOfPayment | null;
  orderQty: number;
  totalAmt: number;
  appQty: number;
  appAmt: number;
  createdAt: string;
  updatedAt: string;
  lastUpdatedBy: string;
  lines: OrderHistoryLine[];
  approvalLevels: OrderHistoryApproval[];
}

export interface OrderHistoryDetailLine extends OrderHistoryLine {
  amount: number;
  approvedAmount: number | null;
  /** Unit CBM stored on the model. Null when the model has none. */
  unitCbm: number | null;
}

/** The one delivery linked to an order. Display and link only. */
export interface OrderHistoryLinkedDelivery {
  id: string;
  deliveryNo: string;
  status: { code: string; name: string; color: string | null };
}

/** One order opened from Order History, including the approval clock. */
export interface OrderHistoryDetail extends Omit<OrderHistoryRow, "lines" | "status" | "modeOfPayment"> {
  status: BranchOrderStatus;
  dealerName: string | null;
  /** Resolved payment name. Null when neither the order nor the dealer has one. */
  paymentLabel: string | null;
  processedAt: string | null;
  lines: OrderHistoryDetailLine[];
  /** Null when this order has no delivery. Not an overall fulfillment status. */
  delivery: OrderHistoryLinkedDelivery | null;
}
