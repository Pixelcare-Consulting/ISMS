import { DEFAULT_TABLE_PAGE_SIZE } from "@/components/data-table/table-page-size";

export const SC_INVENTORY_HREF = "/service-centers/inventory";

/** Service Center Inventory URL. With a center it opens that center's units. */
export function scInventoryHref(input?: {
  centerId?: string;
  q?: string;
  statusCodeId?: string;
  sku?: string;
  locationId?: string;
  /** Active series id from Master data. Omitted means All series. */
  series?: string;
  page?: number;
  limit?: number;
}): string {
  const params = new URLSearchParams();
  if (input?.centerId) params.set("center", input.centerId);
  const q = input?.q?.trim();
  if (q) params.set("q", q);
  if (input?.statusCodeId) params.set("status", input.statusCodeId);
  const sku = input?.sku?.trim();
  if (sku) params.set("sku", sku);
  if (input?.locationId) params.set("location", input.locationId);
  const series = input?.series?.trim();
  if (series) params.set("series", series);
  if (input?.page && input.page > 1) params.set("page", String(input.page));
  if (input?.limit && input.limit !== DEFAULT_TABLE_PAGE_SIZE) params.set("limit", String(input.limit));
  const query = params.toString();
  return query ? `${SC_INVENTORY_HREF}?${query}` : SC_INVENTORY_HREF;
}
