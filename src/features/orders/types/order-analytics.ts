import type { BranchOrderType } from "@prisma/client";

export interface OrderInventoryStatusCount {
  code: string;
  count: number;
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
  onPlanogram: boolean;
  remainingCapacity: number;
}

export interface OrderWorkspacePayload extends OrderAnalyticsPayload {
  windowBlocked: boolean;
  windowReason: string | null;
  additionalModels: OrderWorkspaceAdditionalModel[];
}

export interface OrderHistoryRow {
  id: string;
  orderNumber: string;
  orderType: BranchOrderType;
  status: string;
  branchName: string;
  orderQty: number;
  totalAmt: number;
  appQty: number;
  appAmt: number;
  createdAt: string;
  updatedAt: string;
  lastUpdatedBy: string;
}
