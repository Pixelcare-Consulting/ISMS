import { DEFAULT_TABLE_PAGE_SIZE } from "@/components/data-table/table-page-size";

/** Sales list URL. Omits default page and page size. Status and search are omitted when cleared. */
export function buildSalesPageHref(input: {
  /** List page path. Defaults to branch Sales (`/sales`). */
  basePath?: string;
  page?: number;
  limit?: number;
  sort?: string;
  sortDir?: string;
  status?: string;
  /** Table search. Kept when a status card changes, dropped when the box is cleared. */
  q?: string;
}): string {
  const params = new URLSearchParams();
  const page = input.page ?? 1;
  const limit = input.limit ?? DEFAULT_TABLE_PAGE_SIZE;
  if (page > 1) params.set("page", String(page));
  if (limit !== DEFAULT_TABLE_PAGE_SIZE) params.set("limit", String(limit));
  if (input.sort) params.set("sort", input.sort);
  if (input.sort && input.sortDir) params.set("dir", input.sortDir);
  if (input.status) params.set("status", input.status);
  const q = input.q?.trim();
  if (q) params.set("q", q);
  const basePath = input.basePath ?? "/sales";
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}