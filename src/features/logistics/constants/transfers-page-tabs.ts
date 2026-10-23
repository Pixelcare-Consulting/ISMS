import { DEFAULT_TABLE_PAGE_SIZE } from "@/components/data-table/table-page-size";

export const TRANSFERS_LIST_PATH = "/logistics/transfers";

export const TRANSFERS_PAGE_TABS = ["transfers", "unit"] as const;
export type TransfersPageTab = (typeof TRANSFERS_PAGE_TABS)[number];

export function parseTransfersPageTab(value?: string): TransfersPageTab {
  if (value === "transfers" || value === "unit") return value;
  return "transfers";
}

/** List URL for a transfers tab. The branch-transfer tab omits `tab`, matching Orders. */
export function transfersListHref(
  tab: TransfersPageTab,
  page = 1,
  limit: number = DEFAULT_TABLE_PAGE_SIZE,
): string {
  const params = new URLSearchParams();
  switch (tab) {
    case "transfers":
      break;
    case "unit":
      params.set("tab", "unit");
      break;
    default: {
      const _exhaustive: never = tab;
      return _exhaustive;
    }
  }
  if (page > 1) params.set("page", String(page));
  if (limit !== DEFAULT_TABLE_PAGE_SIZE) params.set("limit", String(limit));
  const query = params.toString();
  return query ? `${TRANSFERS_LIST_PATH}?${query}` : TRANSFERS_LIST_PATH;
}
