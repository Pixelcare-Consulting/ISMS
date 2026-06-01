import type { ReasonStatusCategory } from "@prisma/client";

export interface ReasonStatusDefaultGroup {
  category: ReasonStatusCategory;
  name: string;
  code: string;
  codes: { code: string; name: string; sortOrder: number }[];
}

/** ISMS-v2 schema defaults — seeded per tenant, editable in Settings → Status. */
export const REASON_STATUS_DEFAULTS: ReasonStatusDefaultGroup[] = [
  {
    category: "inventory_system",
    name: "Inventory system status",
    code: "inventory_system",
    codes: [
      { code: "DIT", name: "Delivery in transit", sortOrder: 1 },
      { code: "STK", name: "Stock", sortOrder: 2 },
      { code: "SLD", name: "Sold", sortOrder: 3 },
      { code: "RSV", name: "Reserved", sortOrder: 4 },
      { code: "DEF", name: "Defective", sortOrder: 5 },
      { code: "FPO", name: "For pull-out", sortOrder: 6 },
    ],
  },
  {
    category: "pullout_reason",
    name: "Pull-out reason",
    code: "pullout_reason",
    codes: [
      { code: "DEF", name: "Defective units", sortOrder: 1 },
      { code: "OVR", name: "Overstock", sortOrder: 2 },
      { code: "MDL", name: "Model discontinuation", sortOrder: 3 },
      { code: "OTH", name: "Other", sortOrder: 4 },
    ],
  },
  {
    category: "delivery_workflow",
    name: "Delivery workflow",
    code: "delivery_workflow",
    codes: [
      { code: "pending", name: "Pending acceptance", sortOrder: 1 },
      { code: "accepted", name: "Accepted", sortOrder: 2 },
      { code: "partial", name: "Partially accepted", sortOrder: 3 },
    ],
  },
  {
    category: "transfer_workflow",
    name: "Transfer workflow",
    code: "transfer_workflow",
    codes: [
      { code: "draft", name: "Draft", sortOrder: 1 },
      { code: "pending_tl", name: "Pending TL", sortOrder: 2 },
      { code: "in_transit", name: "In transit", sortOrder: 3 },
      { code: "completed", name: "Completed", sortOrder: 4 },
      { code: "cancelled", name: "Cancelled", sortOrder: 5 },
    ],
  },
  {
    category: "pullout_workflow",
    name: "Pull-out workflow",
    code: "pullout_workflow",
    codes: [
      { code: "draft", name: "Draft", sortOrder: 1 },
      { code: "pending_tl", name: "Pending TL", sortOrder: 2 },
      { code: "pending_logistics", name: "Pending logistics", sortOrder: 3 },
      { code: "completed", name: "Completed", sortOrder: 4 },
      { code: "cancelled", name: "Cancelled", sortOrder: 5 },
    ],
  },
];

/** Maps legacy Prisma enum values to new inventory_system codes. */
export const LEGACY_INVENTORY_STATUS_TO_CODE: Record<string, string> = {
  DeliveryInTransit: "DIT",
  Stock: "STK",
  Sold: "SLD",
  Reserved: "RSV",
  Defective: "DEF",
  ForPullout: "FPO",
};

export const REASON_STATUS_CATEGORY_LABELS: Record<ReasonStatusCategory, string> = {
  inventory_system: "Inventory system status",
  pullout_reason: "Pull-out reason",
  delivery_workflow: "Delivery workflow",
  transfer_workflow: "Transfer workflow",
  pullout_workflow: "Pull-out workflow",
};
