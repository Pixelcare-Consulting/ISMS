import { DEFAULT_TABLE_PAGE_SIZE } from "@/components/data-table/table-page-size";

/**
 * Sales Transactions tabs. Branch sales are the default; the Service Center tab lists the
 * copies made when a branch Service Return / Replacement went to a service center.
 */
export const SALES_PAGE_TABS = ["branch", "service-center"] as const;

export type SalesPageTab = (typeof SALES_PAGE_TABS)[number];

export const DEFAULT_SALES_PAGE_TAB: SalesPageTab = "branch";

export function parseSalesPageTab(value: string | null | undefined): SalesPageTab | null {
  return (SALES_PAGE_TABS as readonly string[]).includes(value ?? "")
    ? (value as SalesPageTab)
    : null;
}

/** Sales list URL. Omits default page, page size, and tab. Status and search are omitted when cleared. */
export function buildSalesPageHref(input: {
  /** List page path. Defaults to branch Sales (`/sales`). */
  basePath?: string;
  /** Sales Transactions tab; the branch tab is the default and is left out. */
  tab?: SalesPageTab;
  page?: number;
  limit?: number;
  sort?: string;
  sortDir?: string;
  status?: string;
  /** Table search. Kept when a status card changes, dropped when the box is cleared. */
  q?: string;
}): string {
  const params = new URLSearchParams();
  if (input.tab && input.tab !== DEFAULT_SALES_PAGE_TAB) params.set("tab", input.tab);
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