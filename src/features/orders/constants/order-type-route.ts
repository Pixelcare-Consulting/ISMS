import type { BranchOrderType } from "@prisma/client";

/**
 * List and detail paths for each order type.
 * Client-safe copy of ORDER_TYPE_ROUTE in order-permissions.ts. Keep both in sync.
 */
export const ORDER_TYPE_ROUTE: Record<BranchOrderType, string> = {
  manual: "/orders/manual",
  special: "/orders/special",
  auto_replenish: "/orders/auto-replenish",
};
