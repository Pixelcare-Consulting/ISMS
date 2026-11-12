export const INVENTORY_APPROVAL_VIEW = "inventory_approvals.view";

export const INVENTORY_APPROVAL_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
export type InventoryApprovalStatus = (typeof INVENTORY_APPROVAL_STATUSES)[number];

export const INVENTORY_APPROVAL_SOURCES = [
  "DEFECT_REPORT",
  "TRANSFER",
  "PULLOUT",
  "SALES_RETURN",
  "DELIVERY_RETURN",
  "DELIVERY_TRANSFER",
  "SC_PULLOUT",
  "SC_RETURN",
] as const;
export type InventoryApprovalSource = (typeof INVENTORY_APPROVAL_SOURCES)[number];

export const INVENTORY_APPROVAL_STEPS = [
  "INSPECTION",
  "CS_EVALUATION",
  "TL_APPROVAL",
  "APPROVAL",
  "RECEIVING",
] as const;
export type InventoryApprovalStep = (typeof INVENTORY_APPROVAL_STEPS)[number];

export const INVENTORY_APPROVAL_STATUS_LABELS: Record<InventoryApprovalStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

export const INVENTORY_APPROVAL_SOURCE_LABELS: Record<InventoryApprovalSource, string> = {
  DEFECT_REPORT: "Defect report",
  TRANSFER: "Transfer",
  PULLOUT: "Pull-out",
  SALES_RETURN: "Sales return",
  DELIVERY_RETURN: "Delivery return",
  DELIVERY_TRANSFER: "Unit transfer",
  SC_PULLOUT: "Service center pull-out",
  SC_RETURN: "Service center return",
};

export const INVENTORY_APPROVAL_STEP_LABELS: Record<InventoryApprovalStep, string> = {
  INSPECTION: "Inspection",
  CS_EVALUATION: "CS evaluation",
  TL_APPROVAL: "TL approval",
  APPROVAL: "Approval",
  RECEIVING: "Receiving",
};

export interface InventoryApprovalAttachment {
  id: string;
  name: string;
  href: string;
}

export interface InventoryApprovalRow {
  id: string;
  serialNo: string;
  modelLabel: string;
  sourceType: InventoryApprovalSource;
  sourceNo: string | null;
  step: InventoryApprovalStep;
  status: InventoryApprovalStatus;
  requestedBy: string | null;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  remarks: string | null;
  problemDescription: string | null;
  attachments: InventoryApprovalAttachment[];
}

export function formatInventoryApprovalTime(value: string): string {
  return new Date(value).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
