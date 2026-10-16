/**
 * Grouped Stock units (by branch / by model) count the tenant's active
 * inventory statuses — the same list as the summary cards.
 */
export type StockUnitsGroupBy = "by-branch" | "by-model";

export type StockUnitsGroupChildLevel = "models" | "branches" | "serials";
