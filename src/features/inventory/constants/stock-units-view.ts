export type StockUnitsView = "by-branch" | "by-model" | "all";

const STOCK_UNITS_VIEWS = new Set<StockUnitsView>(["by-branch", "by-model", "all"]);

export function parseStockUnitsView(value?: string | null): StockUnitsView {
  if (value && STOCK_UNITS_VIEWS.has(value as StockUnitsView)) {
    return value as StockUnitsView;
  }
  return "by-branch";
}

export function isGroupedStockUnitsView(
  view: StockUnitsView,
): view is "by-branch" | "by-model" {
  return view === "by-branch" || view === "by-model";
}

export const STOCK_UNITS_VIEW_OPTIONS: {
  id: StockUnitsView;
  label: string;
}[] = [
  { id: "by-branch", label: "By branch" },
  { id: "by-model", label: "By model" },
  { id: "all", label: "All serials" },
];
