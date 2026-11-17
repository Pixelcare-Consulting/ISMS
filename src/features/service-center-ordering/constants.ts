export { SAP_LINE_PO_NUMBER_MAX as SC_ORDER_PO_NUMBER_MAX } from "@/features/sap/constants/sap-line-fields";

/**
 * Statuses an SC order can be approved or rejected from. New orders start at pending_sp
 * (Supply Planning is the one approval step); pending_tl is kept for orders made before that.
 */
export const SC_ORDER_APPROVABLE_STATUSES = ["pending_sp", "pending_tl"] as const;

export function isScOrderApprovable(status: string): boolean {
  return (SC_ORDER_APPROVABLE_STATUSES as readonly string[]).includes(status);
}

/** SAP codes (CardCode, warehouse, distribution rule) never exceed this in the company DB. */
export const SAP_CODE_MAX = 50;

export const SC_ORDERING_SETTINGS_PATH = "/settings/ordering";

export const SC_ORDERING_NOT_SET_UP =
  "Service center ordering is not set up. Add a customer and a warehouse in Settings → Ordering policy.";

/** The defaults, as the settings page and the order form label them. */
export const SC_ORDERING_DEFAULT_LABELS = {
  warehouseCode: "Warehouse",
  branchCode: "Branch",
  departmentCode: "Department",
  cogsBranchCode: "COGS branch",
} as const;

export type ScOrderingDefaultKey = keyof typeof SC_ORDERING_DEFAULT_LABELS;
