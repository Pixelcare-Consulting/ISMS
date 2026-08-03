import { decimalToNumber, decimalToNumberOrNull } from "@/lib/database/decimal";
import { formatPeriodDate } from "@/features/master-data/types/client-price-list";
import { pickActivePriceListRow } from "@/features/master-data/utils/resolve-price-list";

export interface ClientModelPriceListRow {
  id: string;
  amount: number;
  periodStart: string;
  periodEnd: string;
  packageTypeId: string | null;
  packageType: { id: string; name: string; quantity: number } | null;
}

export interface ClientModelRow {
  id: string;
  skuCode: string;
  name: string;
  status: string;
  effectivePrice: number | null;
  cbm: number | null;
  brand: { name: string } | null;
  category: { name: string } | null;
  priceLists: ClientModelPriceListRow[];
}

type PrismaModelRow = {
  id: string;
  skuCode: string;
  name: string;
  status: string;
  cbm: { toString(): string } | number | null;
  brand: { name: string } | null;
  category: { name: string } | null;
  priceLists?: {
    id: string;
    amount: { toString(): string } | number;
    periodStart: Date | string;
    periodEnd: Date | string;
    packageTypeId: string | null;
    packageType: { id: string; name: string; quantity: number } | null;
  }[];
};

export function toClientModelRow(model: PrismaModelRow): ClientModelRow {
  const priceLists: ClientModelPriceListRow[] = (model.priceLists ?? []).map((row) => ({
    id: row.id,
    amount: decimalToNumber(row.amount),
    periodStart: formatPeriodDate(row.periodStart),
    periodEnd: formatPeriodDate(row.periodEnd),
    packageTypeId: row.packageTypeId,
    packageType: row.packageType,
  }));

  const activeRow = pickActivePriceListRow(priceLists, (row) => row);

  return {
    id: model.id,
    skuCode: model.skuCode,
    name: model.name,
    status: model.status,
    effectivePrice: activeRow ? activeRow.amount : null,
    cbm: decimalToNumberOrNull(model.cbm),
    brand: model.brand ? { name: model.brand.name } : null,
    category: model.category ? { name: model.category.name } : null,
    priceLists,
  };
}
