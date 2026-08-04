import type { ReasonStatusCategory } from "@prisma/client";

import type { StatusColorKey } from "@/features/reason-status/constants/status-colors";

export interface ReasonStatusDefaultCode {
  code: string;
  name: string;
  sortOrder: number;
  color: StatusColorKey;
}

export interface ReasonStatusDefaultGroup {
  category: ReasonStatusCategory;
  name: string;
  code: string;
  /** Short blurb: which app area uses this group */
  usedIn: string;
  codes: ReasonStatusDefaultCode[];
}

/** ISMS-v2 schema defaults — seeded per tenant, editable in Settings → Status. */
export const REASON_STATUS_DEFAULTS: ReasonStatusDefaultGroup[] = [
  {
    category: "inventory_system",
    name: "Inventory system status",
    code: "inventory_system",
    usedIn:
      "Stock units and serial detail — the life-cycle of each physical unit (in transit, on hand, sold, reserved, defective, for pull-out).",
    codes: [
      { code: "DIT", name: "Delivery in transit", sortOrder: 1, color: "sky" },
      { code: "STK", name: "Stock", sortOrder: 2, color: "emerald" },
      { code: "SLD", name: "Sold", sortOrder: 3, color: "slate" },
      { code: "RSV", name: "Reserved", sortOrder: 4, color: "orange" },
      { code: "DEF", name: "Defective", sortOrder: 5, color: "rose" },
      { code: "FPO", name: "For pull-out", sortOrder: 6, color: "violet" },
    ],
  },
  {
    category: "pullout_reason",
    name: "Pull-out reason",
    code: "pullout_reason",
    usedIn:
      "Logistics → Pull-outs — why units are being pulled (defective, overstock, discontinuation, other).",
    codes: [
      { code: "DEF", name: "Defective units", sortOrder: 1, color: "rose" },
      { code: "OVR", name: "Overstock", sortOrder: 2, color: "amber" },
      { code: "MDL", name: "Model discontinuation", sortOrder: 3, color: "orange" },
      { code: "OTH", name: "Other", sortOrder: 4, color: "slate" },
    ],
  },
  {
    category: "delivery_workflow",
    name: "Delivery workflow",
    code: "delivery_workflow",
    usedIn:
      "Logistics → Deliveries — request through accept / reject / partial accept for inbound branch deliveries.",
    codes: [
      { code: "requested", name: "Requested", sortOrder: 1, color: "sky" },
      { code: "approved", name: "Approved", sortOrder: 2, color: "emerald" },
      { code: "pending", name: "Pending acceptance", sortOrder: 3, color: "amber" },
      { code: "accepted", name: "Accepted", sortOrder: 4, color: "emerald" },
      { code: "rejected", name: "Rejected", sortOrder: 5, color: "rose" },
      { code: "partial", name: "Partially accepted", sortOrder: 6, color: "violet" },
    ],
  },
  {
    category: "transfer_workflow",
    name: "Transfer workflow",
    code: "transfer_workflow",
    usedIn:
      "Logistics → Transfers — branch-to-branch transfer from draft / pending TL through in transit and completed.",
    codes: [
      { code: "requested", name: "Requested", sortOrder: 1, color: "sky" },
      { code: "approved", name: "Approved", sortOrder: 2, color: "emerald" },
      { code: "draft", name: "Draft", sortOrder: 3, color: "slate" },
      { code: "pending_tl", name: "Pending TL", sortOrder: 4, color: "amber" },
      { code: "for_transfer", name: "For transfer", sortOrder: 5, color: "violet" },
      { code: "in_transit", name: "In transit", sortOrder: 6, color: "sky" },
      { code: "accepted", name: "Accepted", sortOrder: 7, color: "emerald" },
      { code: "rejected", name: "Rejected", sortOrder: 8, color: "rose" },
      { code: "completed", name: "Completed", sortOrder: 9, color: "emerald" },
      { code: "cancelled", name: "Cancelled", sortOrder: 10, color: "rose" },
    ],
  },
  {
    category: "pullout_workflow",
    name: "Pull-out workflow",
    code: "pullout_workflow",
    usedIn:
      "Logistics → Pull-outs — progress of a pull-out request (reserve, schedule, logistics, in transit, pulled out).",
    codes: [
      { code: "requested", name: "Requested", sortOrder: 1, color: "sky" },
      { code: "approved", name: "Approved", sortOrder: 2, color: "emerald" },
      { code: "draft", name: "Draft", sortOrder: 3, color: "slate" },
      { code: "pending_tl", name: "Reserve pull-out", sortOrder: 4, color: "amber" },
      { code: "for_pullout", name: "For pull-out", sortOrder: 5, color: "violet" },
      { code: "scheduled", name: "Scheduled", sortOrder: 6, color: "teal" },
      { code: "pending_logistics", name: "Pending logistics", sortOrder: 7, color: "amber" },
      { code: "in_transit", name: "Pull-out in transit", sortOrder: 8, color: "sky" },
      { code: "pulled_out", name: "Pulled out", sortOrder: 9, color: "emerald" },
      { code: "completed", name: "Completed", sortOrder: 10, color: "emerald" },
      { code: "cancelled", name: "Cancelled", sortOrder: 11, color: "rose" },
    ],
  },
  {
    category: "sales_atr",
    name: "Sales & ATR",
    code: "sales_atr",
    usedIn:
      "Sales & ATR — return request steps (Pending CS / TL, approved, rejected, completed) and ATR header status (open, reserve, closed).",
    codes: [
      { code: "pending_cs", name: "Pending CS", sortOrder: 1, color: "amber" },
      { code: "pending_tl", name: "Pending TL", sortOrder: 2, color: "amber" },
      { code: "approved", name: "Approved", sortOrder: 3, color: "emerald" },
      { code: "rejected", name: "Rejected", sortOrder: 4, color: "rose" },
      { code: "completed", name: "Completed", sortOrder: 5, color: "emerald" },
      { code: "open", name: "Open", sortOrder: 6, color: "sky" },
      { code: "reserve", name: "Reserve", sortOrder: 7, color: "amber" },
      { code: "closed", name: "Closed", sortOrder: 8, color: "slate" },
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
  sales_atr: "Sales & ATR",
};

export const REASON_STATUS_CATEGORY_USED_IN: Record<ReasonStatusCategory, string> =
  Object.fromEntries(
    REASON_STATUS_DEFAULTS.map((group) => [group.category, group.usedIn]),
  ) as Record<ReasonStatusCategory, string>;
