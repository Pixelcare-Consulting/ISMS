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

export interface ClientLookupRef {
  id: string;
  name: string;
}

export interface ClientModelRow {
  id: string;
  skuCode: string;
  name: string;
  status: string;
  effectivePrice: number | null;
  cbm: number | null;
  brand: ClientLookupRef | null;
  series: ClientLookupRef | null;
  category: ClientLookupRef | null;
  feature: ClientLookupRef | null;
  resolution: ClientLookupRef | null;
  actualSize: ClientLookupRef | null;
  priceLists: ClientModelPriceListRow[];
}

type PrismaModelRow = {
  id: string;
  skuCode: string;
  name: string;
  status: string;
  cbm: { toString(): string } | number | null;
  brand: ClientLookupRef | null;
  series: ClientLookupRef | null;
  // Optional: rows cached before these relations were selected do not carry them.
  category?: ClientLookupRef | null;
  feature?: ClientLookupRef | null;
  resolution?: ClientLookupRef | null;
  actualSize?: ClientLookupRef | null;
  priceLists?: {
    id: string;
    amount: { toString(): string } | number;
    periodStart: Date | string;
    periodEnd: Date | string;
    packageTypeId: string | null;
    packageType: { id: string; name: string; quantity: number } | null;
  }[];
};

function toRef(row: ClientLookupRef | null | undefined): ClientLookupRef | null {
  return row ? { id: row.id, name: row.name } : null;
}

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
    brand: toRef(model.brand),
    series: toRef(model.series),
    category: toRef(model.category),
    feature: toRef(model.feature),
    resolution: toRef(model.resolution),
    actualSize: toRef(model.actualSize),
    priceLists,
  };
}
