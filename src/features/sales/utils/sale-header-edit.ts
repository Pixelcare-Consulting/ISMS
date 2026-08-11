/** Inventory / sale-line status after Official Sales process. */
export const OFFICIAL_SOLD_STATUS_CODE = "OFS";

export function isOfficialSoldStatusCode(
  code: string | null | undefined,
): boolean {
  return code?.trim().toUpperCase() === OFFICIAL_SOLD_STATUS_CODE;
}

/** True when any detail line is already Official Sold (OFS). */
export function saleHasOfficialSoldLine(
  lines: Array<{ statusCode?: { code?: string | null } | null }>,
): boolean {
  return lines.some((line) => isOfficialSoldStatusCode(line.statusCode?.code));
}

/** Header edit is blocked once any line has been marked Official Sold. */
export function canEditSaleHeaderForLines(
  lines: Array<{ statusCode?: { code?: string | null } | null }>,
): boolean {
  return !saleHasOfficialSoldLine(lines);
}
