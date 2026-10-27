/**
 * Worksheet filters hide rows only.
 * Callers keep the full line list for quantities, remarks, and totals.
 */

export interface WorksheetLineFilter {
  orderedOnly: boolean;
  modelSearch: string;
  /** Empty string shows every brand. */
  brandId: string;
}

export const EMPTY_WORKSHEET_LINE_FILTER: WorksheetLineFilter = {
  orderedOnly: false,
  modelSearch: "",
  brandId: "",
};

/**
 * Brand choices for the create-order model list.
 * Only brands that appear on this branch's planogram lines. Additional items
 * can use other brands, and those stay out of this list.
 */
export function planogramBrandOptions(
  brands: readonly { id: string; name: string }[],
  lines: readonly { brandId: string | null; brandName?: string | null; onPlanogram: boolean }[],
): { id: string; name: string }[] {
  const allowed = new Set<string>();
  const namesFromLines = new Map<string, string>();
  for (const line of lines) {
    if (!line.onPlanogram || !line.brandId) continue;
    allowed.add(line.brandId);
    const name = line.brandName?.trim();
    if (name) namesFromLines.set(line.brandId, name);
  }
  const listed = brands
    .filter((brand) => allowed.has(brand.id))
    .map((brand) => ({ id: brand.id, name: brand.name }));
  const seen = new Set(listed.map((brand) => brand.id));
  for (const [id, name] of namesFromLines) {
    if (seen.has(id)) continue;
    listed.push({ id, name });
  }
  listed.sort((a, b) => a.name.localeCompare(b.name));
  return listed;
}

/** Fixed worksheet page size. The sheet does not offer a larger page. */
export const WORKSHEET_PAGE_SIZE = 10;

export interface WorksheetFilterableLine {
  skuCode: string;
  name: string;
  brandId: string | null;
  requestedQty: number;
}

export interface WorksheetTotalLine {
  requestedQty: number;
  approvedQty: number | null;
  srp: number;
  cbm: number;
}

export interface WorksheetOrderTotals {
  requestedAmount: number;
  requestedCbm: number;
  approvedAmount: number;
  approvedCbm: number;
}

/**
 * Returns the same line objects that still match. It does not copy or clear
 * quantities, remarks, or any other stored field.
 */
export function visibleWorksheetLines<T extends WorksheetFilterableLine>(
  lines: readonly T[],
  filter: WorksheetLineFilter,
): T[] {
  const search = filter.modelSearch.trim().toLowerCase();
  const brandId = filter.brandId.trim();
  return lines.filter((line) => {
    if (filter.orderedOnly && line.requestedQty < 1) return false;
    if (brandId && line.brandId !== brandId) return false;
    if (!search) return true;
    const haystack = `${line.skuCode} ${line.name}`.toLowerCase();
    return haystack.includes(search);
  });
}

/** Totals always come from the full stored list, never from the visible subset. */
export function worksheetOrderTotals(
  lines: readonly WorksheetTotalLine[],
  options?: { includeApproved?: boolean },
): WorksheetOrderTotals {
  let requestedAmount = 0;
  let requestedCbm = 0;
  let approvedAmount = 0;
  let approvedCbm = 0;
  const includeApproved = options?.includeApproved === true;

  for (const line of lines) {
    if (line.requestedQty < 1) continue;
    requestedAmount += line.requestedQty * line.srp;
    requestedCbm += line.requestedQty * line.cbm;
    if (!includeApproved) continue;
    const approved = line.approvedQty ?? line.requestedQty;
    approvedAmount += approved * line.srp;
    approvedCbm += approved * line.cbm;
  }

  return { requestedAmount, requestedCbm, approvedAmount, approvedCbm };
}

export interface WorksheetRequestedFooter {
  lineCount: number;
  quantity: number;
}

/**
 * Page a list that is already filtered.
 * Row numbers stay on the full filtered list: page 2 starts at 11.
 */
export function paginateWorksheetLines<T>(
  lines: readonly T[],
  page: number,
  pageSize: number = WORKSHEET_PAGE_SIZE,
): {
  page: number;
  totalPages: number;
  total: number;
  indexOffset: number;
  rows: T[];
} {
  const size = pageSize > 0 ? pageSize : WORKSHEET_PAGE_SIZE;
  const total = lines.length;
  const totalPages = Math.max(1, Math.ceil(total / size) || 1);
  const requested = Number.isFinite(page) ? Math.trunc(page) : 1;
  const safePage = Math.min(Math.max(1, requested), totalPages);
  const indexOffset = (safePage - 1) * size;
  return {
    page: safePage,
    totalPages,
    total,
    indexOffset,
    rows: lines.slice(indexOffset, indexOffset + size),
  };
}

/** Lines the user is ordering: requested quantity greater than zero. */
export function worksheetRequestedFooter(
  lines: readonly { requestedQty: number }[],
): WorksheetRequestedFooter {
  let lineCount = 0;
  let quantity = 0;
  for (const line of lines) {
    if (!(line.requestedQty > 0)) continue;
    lineCount += 1;
    quantity += line.requestedQty;
  }
  return { lineCount, quantity };
}

/** Left side of the sheet pager. Same wording on the order sheet and analytics. */
export function worksheetTotalsLabel(lineCount: number, quantity: number): string {
  return `Total lines: ${lineCount.toLocaleString()} · Total qty: ${quantity.toLocaleString()}`;
}
