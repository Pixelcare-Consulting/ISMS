export const LOGISTICS_DELIVERIES_PATH = "/logistics/deliveries";
export const LOGISTICS_TRANSFERS_PATH = "/logistics/transfers";
export const LOGISTICS_PICKUPS_PATH = "/logistics/pickups";

export function buildLogisticsPageHref(basePath: string, page: number): string {
  if (page <= 1) return basePath;
  return `${basePath}?page=${page}`;
}
