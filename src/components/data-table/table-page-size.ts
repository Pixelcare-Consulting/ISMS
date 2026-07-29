/** Allowed rows-per-page values for data tables. */
export const TABLE_PAGE_SIZE_OPTIONS = [10, 25, 50, 75, 100, 200] as const;

export type TablePageSize = (typeof TABLE_PAGE_SIZE_OPTIONS)[number];

export const DEFAULT_TABLE_PAGE_SIZE: TablePageSize = 10;

/** Parse a URL/search param into an allowed page size (falls back to default). */
export function parseTablePageSize(value?: string | number | null): TablePageSize {
  const n = typeof value === "number" ? value : Number(value);
  return (TABLE_PAGE_SIZE_OPTIONS as readonly number[]).includes(n)
    ? (n as TablePageSize)
    : DEFAULT_TABLE_PAGE_SIZE;
}
