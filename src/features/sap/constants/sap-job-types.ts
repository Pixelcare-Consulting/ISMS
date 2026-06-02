import type {
  SapIntegrationJobStatus,
  SapIntegrationJobType,
} from "@prisma/client";

export const SAP_JOB_TYPE_LABELS: Record<SapIntegrationJobType, string> = {
  approved_order: "Approved order → SAP ITR/SO",
  pullout_itr: "Pull-out ITR",
  sales_summary: "Sales summary export",
  inventory_sync_inbound: "Inventory sync from SAP",
  inventory_adjustment: "Inventory adjustment",
  delivery_sync_inbound: "Delivery sync from SAP",
};

export const SAP_JOB_STATUS_LABELS: Record<SapIntegrationJobStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
  dead_letter: "Dead letter",
};

export const SAP_REFERENCE_TYPES = {
  BranchOrder: "BranchOrder",
  BranchDelivery: "BranchDelivery",
  BranchPullout: "BranchPullout",
  StockVariance: "StockVariance",
} as const;
