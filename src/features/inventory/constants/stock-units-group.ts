/**
 * Grouped Stock units (by branch / by warehouse / by model) count the tenant's active
 * inventory statuses — the same list as the summary cards.
 */
export type StockUnitsGroupBy = "by-branch" | "by-warehouse" | "by-model";

export type StockUnitsGroupChildLevel = "models" | "branches" | "warehouses" | "serials";

/**
 * Under a branch in the By warehouse view: its primary warehouse holds the branch's own
 * units; each alternate warehouse is another branch whose stock this branch can draw on.
 */
export type StockUnitsWarehouseRole = "PRIMARY" | "ALTERNATE";

export const STOCK_UNITS_WAREHOUSE_ROLE_LABELS: Record<StockUnitsWarehouseRole, string> = {
  PRIMARY: "Primary warehouse",
  ALTERNATE: "Alternate warehouse",
};
