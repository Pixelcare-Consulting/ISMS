import { ORDER_VIEW_REPORT_PERMISSIONS } from "@/features/orders/constants/order-permissions";

/** Permissions that open the order-based reports (and their exports). */
export const REPORT_ACCESS = ["reports.view", ...ORDER_VIEW_REPORT_PERMISSIONS] as const;

export const INVENTORY_REPORT_ACCESS = ["reports.view", "inventory.view"] as const;

export const SALES_REPORT_ACCESS = [...REPORT_ACCESS, "sales.create"] as const;

export const TRANSFER_REPORT_ACCESS = [
  ...REPORT_ACCESS,
  "logistics.view",
  "logistics.create",
  "logistics.manage",
] as const;
