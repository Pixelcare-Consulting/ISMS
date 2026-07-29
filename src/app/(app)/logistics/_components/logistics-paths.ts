import { DEFAULT_TABLE_PAGE_SIZE } from "@/components/data-table/table-page-size";

export const LOGISTICS_DELIVERIES_PATH = "/logistics/deliveries";
export const LOGISTICS_TRANSFERS_PATH = "/logistics/transfers";
export const LOGISTICS_PICKUPS_PATH = "/logistics/pickups";

export function buildLogisticsPageHref(
  basePath: string,
  page: number,
  limit: number = DEFAULT_TABLE_PAGE_SIZE,
): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (limit !== DEFAULT_TABLE_PAGE_SIZE) params.set("limit", String(limit));
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}
