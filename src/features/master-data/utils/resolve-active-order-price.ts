import { decimalToNumber } from "@/lib/database/decimal";
import { formatPeriodDate } from "@/features/master-data/types/client-price-list";
import { pickActivePriceListRow } from "@/features/master-data/utils/resolve-price-list";

export type ActiveOrderPriceRow = {
  amount: { toString(): string } | number;
  periodStart: Date | string;
  periodEnd: Date | string;
  packageTypeId: string | null;
};

/**
 * Order price matching Models: the price-list row active today
 * (general row first, otherwise a package row such as SOLO),
 * then ProductModel.srp when no row covers today.
 */
export function resolveActiveOrderPrice(
  priceLists: readonly ActiveOrderPriceRow[] | null | undefined,
  fallbackSrp: { toString(): string } | number | null | undefined,
  today?: string,
): number {
  const rows = (priceLists ?? []).map((row) => ({
    amount: decimalToNumber(row.amount),
    periodStart: formatPeriodDate(row.periodStart),
    periodEnd: formatPeriodDate(row.periodEnd),
    packageTypeId: row.packageTypeId,
  }));
  const active = pickActivePriceListRow(rows, (row) => row, today);
  if (active) return active.amount;
  return decimalToNumber(fallbackSrp);
}
