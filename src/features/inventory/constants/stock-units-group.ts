/** Status codes included in Stock Units grouped views (branch / model headers + nested rows). */
export const STOCK_UNITS_GROUP_STATUS_CODES = ["STK", "DEF", "RSV"] as const;

export type StockUnitsGroupBy = "by-branch" | "by-model";

export type StockUnitsGroupChildLevel = "models" | "branches" | "serials";
