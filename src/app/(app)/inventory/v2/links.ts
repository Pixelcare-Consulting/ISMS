export const BRANCH_INVENTORY_V2_PAGE_SIZE = 10;

export function branchInventoryV2Href(input?: {
  view?: "all";
  branchId?: string;
  q?: string;
  statusCodeId?: string;
  sku?: string;
  page?: number;
  limit?: number;
  offPlanogram?: boolean;
  /** Active series id from Master data. Omitted means All series. */
  series?: string;
}): string {
  const params = new URLSearchParams();
  if (input?.branchId) {
    params.set("branch", input.branchId);
  } else if (input?.view === "all") {
    params.set("view", "all");
  }
  const q = input?.q?.trim();
  if (q) params.set("q", q);
  if (input?.statusCodeId) params.set("status", input.statusCodeId);
  const sku = input?.sku?.trim();
  if (sku) params.set("sku", sku);
  const series = input?.series?.trim();
  if (series) params.set("series", series);
  if (input?.page && input.page > 1) params.set("page", String(input.page));
  if (input?.limit && input.limit !== BRANCH_INVENTORY_V2_PAGE_SIZE) {
    params.set("limit", String(input.limit));
  }
  if (input?.offPlanogram) {
    params.set("offPlanogram", "1");
  }
  const query = params.toString();
  return query.length > 0 ? `/inventory/v2?${query}` : "/inventory/v2";
}
