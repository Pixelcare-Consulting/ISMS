export const ORDERS_PAGE_TABS = ["orders", "analytics", "history"] as const;
export type OrdersPageTab = (typeof ORDERS_PAGE_TABS)[number];

export function parseOrdersPageTab(value?: string): OrdersPageTab {
  if (value === "analytics" || value === "history") return value;
  return "orders";
}
