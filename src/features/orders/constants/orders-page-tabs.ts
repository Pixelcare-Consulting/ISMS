import type { BranchOrderType } from "@prisma/client";

export const ORDERS_PAGE_TABS = ["orders", "analytics", "history"] as const;
export type OrdersPageTab = (typeof ORDERS_PAGE_TABS)[number];

const AUTO_REPLENISH_PAGE_TABS = ["orders", "history"] as const satisfies readonly OrdersPageTab[];

export function ordersPageTabsForType(orderType: BranchOrderType): readonly OrdersPageTab[] {
  switch (orderType) {
    case "auto_replenish":
      return AUTO_REPLENISH_PAGE_TABS;
    case "manual":
    case "special":
      return ORDERS_PAGE_TABS;
    default: {
      const _exhaustive: never = orderType;
      return _exhaustive;
    }
  }
}

export function parseOrdersPageTab(
  value?: string,
  allowedTabs: readonly OrdersPageTab[] = ORDERS_PAGE_TABS,
): OrdersPageTab {
  if (value && allowedTabs.includes(value as OrdersPageTab)) {
    return value as OrdersPageTab;
  }
  return "orders";
}
