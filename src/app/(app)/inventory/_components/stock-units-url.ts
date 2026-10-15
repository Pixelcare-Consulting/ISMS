import {
  DEFAULT_TABLE_PAGE_SIZE,
  type TablePageSize,
} from "@/components/data-table/table-page-size";
import type { StockUnitsView } from "@/features/inventory/constants/stock-units-view";
import {
  STOCK_UNITS_DEFAULT_SORT,
  STOCK_UNITS_DEFAULT_SORT_DIR,
} from "@/features/inventory/constants/stock-units-sort";

export function buildStockUnitsHref(opts: {
  view?: StockUnitsView;
  page?: number;
  limit?: number;
  offPlanogram?: boolean;
  sort?: string;
  sortDir?: string;
  q?: string;
  filters?: { branch?: string; sku?: string };
}): string {
  const params = new URLSearchParams();
  const view = opts.view ?? "by-branch";
  if (view !== "by-branch") params.set("view", view);

  const page = opts.page ?? 1;
  if (page > 1) params.set("page", String(page));

  const limit = opts.limit ?? DEFAULT_TABLE_PAGE_SIZE;
  if (limit !== DEFAULT_TABLE_PAGE_SIZE) params.set("limit", String(limit));

  if (opts.offPlanogram) params.set("offPlanogram", "1");

  if (opts.q?.trim()) params.set("q", opts.q.trim());

  if (view === "all") {
    const sort = opts.sort;
    const sortDir = opts.sortDir;
    if (
      sort &&
      (sort !== STOCK_UNITS_DEFAULT_SORT ||
        sortDir !== STOCK_UNITS_DEFAULT_SORT_DIR)
    ) {
      params.set("sort", sort);
      if (sortDir) params.set("dir", sortDir);
    }
  }

  if (opts.filters?.branch) params.set("branch", opts.filters.branch);
  if (opts.filters?.sku) params.set("sku", opts.filters.sku);

  const qs = params.toString();
  return qs ? `/inventory?${qs}` : "/inventory";
}

export function stockUnitsHrefForView(
  view: StockUnitsView,
  current: {
    pageSize: TablePageSize;
    offPlanogram: boolean;
    sort?: string;
    sortDir?: string;
    q?: string;
    filters?: { branch?: string; sku?: string };
  },
): string {
  return buildStockUnitsHref({
    view,
    page: 1,
    limit: current.pageSize,
    offPlanogram: current.offPlanogram,
    sort: current.sort,
    sortDir: current.sortDir,
    q: current.q,
    filters: current.filters,
  });
}
