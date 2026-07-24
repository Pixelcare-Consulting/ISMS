import { decimalToNumber } from "@/lib/database/decimal";

export interface ClientPriceListRow {
  id: string;
  amount: number;
  periodStart: string;
  periodEnd: string;
  model: { id: string; skuCode: string; name: string };
  packageType: { id: string; name: string; quantity: number } | null;
}

type PrismaPriceListRow = {
  id: string;
  amount: { toString(): string } | number;
  periodStart: Date | string;
  periodEnd: Date | string;
  model: { id: string; skuCode: string; name: string };
  packageType: { id: string; name: string; quantity: number } | null;
};

function formatPeriodDate(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

export function toClientPriceListRow(
  row: PrismaPriceListRow,
): ClientPriceListRow {
  return {
    id: row.id,
    amount: decimalToNumber(row.amount),
    periodStart: formatPeriodDate(row.periodStart),
    periodEnd: formatPeriodDate(row.periodEnd),
    model: {
      id: row.model.id,
      skuCode: row.model.skuCode,
      name: row.model.name,
    },
    packageType: row.packageType
      ? {
          id: row.packageType.id,
          name: row.packageType.name,
          quantity: row.packageType.quantity,
        }
      : null,
  };
}
