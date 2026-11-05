import type {
  SapIntegrationJobStatus,
  SapIntegrationJobType,
} from "@prisma/client";

/**
 * Job labels use SAP B1 document names from
 * docs/sapb1_mapping_table_Update_gilbert_v2.pdf:
 * ITR (OWTQ), SO (ORDR), Inventory Transfer (OWTR), Delivery Note (ODLN).
 */
export const SAP_JOB_TYPE_LABELS: Record<SapIntegrationJobType, string> = {
  approved_order: "Approved order → ITR or SO",
  /** Retired: pull-outs are ISMS only. Kept so jobs queued before that still have a label. */
  pullout_itr: "Pull-out → Inventory Transfer Request (ITR / OWTQ)",
  sales_summary: "Sales summary export",
  inventory_sync_inbound: "Inventory sync from SAP",
  inventory_adjustment: "Inventory adjustment (legacy)",
  inventory_posting: "Inventory posting (P-Count)",
  delivery_sync_inbound: "Delivery sync from SAP (ODLN / OWTR)",
  delivery_partial_return:
    "Partial delivery return → Inventory Transfer (OWTR)",
  delivery_return: "Delivery return → IT or Return",
  delivery_transfer: "Unit transfer → Inventory Transfer (OWTR)",
  service_center_order: "Service center order → SO",
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
  DeliveryTransfer: "DeliveryTransfer",
  DeliveryReturnRequest: "DeliveryReturnRequest",
  StockVariance: "StockVariance",
  StockCountSession: "StockCountSession",
  ServiceCenterOrder: "ServiceCenterOrder",
} as const;
