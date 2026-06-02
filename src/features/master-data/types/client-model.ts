import { decimalToNumberOrNull } from "@/lib/database/decimal";

export interface ClientModelRow {
  id: string;
  skuCode: string;
  name: string;
  status: string;
  srp: number | null;
  cbm: number | null;
  brand: { name: string } | null;
  category: { name: string } | null;
}

type PrismaModelRow = {
  id: string;
  skuCode: string;
  name: string;
  status: string;
  srp: { toString(): string } | number | null;
  cbm: { toString(): string } | number | null;
  brand: { name: string } | null;
  category: { name: string } | null;
};

export function toClientModelRow(model: PrismaModelRow): ClientModelRow {
  return {
    id: model.id,
    skuCode: model.skuCode,
    name: model.name,
    status: model.status,
    srp: decimalToNumberOrNull(model.srp),
    cbm: decimalToNumberOrNull(model.cbm),
    brand: model.brand ? { name: model.brand.name } : null,
    category: model.category ? { name: model.category.name } : null,
  };
}
