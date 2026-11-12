import { pickDisplayPriceListRow } from "@/features/master-data/utils/resolve-price-list";

export type BranchInventoryV2CardAmounts = {
  total: number;
  inStock: number;
  defective: number;
  offPlanogram: number;
};

export type BranchInventoryV2CardQtyRow = {
  modelId: string;
  /** Model SRP when Master data has one. Null when the model has no SRP. */
  srp: number | null;
  totalQty: number;
  inStockQty: number;
  defectiveQty: number;
  offPlanogramQty: number;
};

export type BranchInventoryV2CardPriceRow = {
  modelId: string;
  amount: number;
  periodStart: string;
  periodEnd: string;
  packageTypeId: string | null;
};

/** Peso lines for one branch's status strip. Sold and Official Sold are not included. */
export type BranchInventoryV2StatusAmounts = {
  total: number;
  offPlanogram: number;
  /** Keyed by status code. STK is stocked-in stock only, matching the Stock card. */
  byStatus: Record<string, number>;
};

export type BranchInventoryV2StatusQtyRow = {
  modelId: string;
  /** Model SRP when Master data has one. Null when the model has no SRP. */
  srp: number | null;
  /** Every visible unit, including stock that is not stocked in. */
  totalQty: number;
  offPlanogramQty: number;
  /**
   * Quantity that belongs on each status card.
   * STK counts only stocked-in units. Other codes count every unit of that status.
   */
  qtyByStatus: Readonly<Record<string, number>>;
};

function finitePrice(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value;
}

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

/**
 * Price for one model on the v2 summary cards.
 * Active price-list row today, otherwise the latest period that already started.
 * A general row wins over a package row. No price list falls back to SRP. Neither is zero.
 */
export function resolveInventoryCardUnitPrice(
  priceRows: readonly Omit<BranchInventoryV2CardPriceRow, "modelId">[],
  srp: number | null,
  today?: string,
): number {
  const selected = pickDisplayPriceListRow(priceRows, (row) => row, today);
  const listed = finitePrice(selected?.amount);
  if (listed != null) return listed;
  const fallback = finitePrice(srp);
  if (fallback != null) return fallback;
  return 0;
}

function pricePeriodsByModel(
  priceRows: readonly BranchInventoryV2CardPriceRow[],
): Map<string, Omit<BranchInventoryV2CardPriceRow, "modelId">[]> {
  const pricesByModel = new Map<string, Omit<BranchInventoryV2CardPriceRow, "modelId">[]>();
  for (const row of priceRows) {
    const period = {
      amount: row.amount,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      packageTypeId: row.packageTypeId,
    };
    const existing = pricesByModel.get(row.modelId);
    if (existing) existing.push(period);
    else pricesByModel.set(row.modelId, [period]);
  }
  return pricesByModel;
}

/** Quantity times the model price, summed across models. Each card uses its own quantity. */
export function sumBranchInventoryV2CardAmounts(
  qtyRows: readonly BranchInventoryV2CardQtyRow[],
  priceRows: readonly BranchInventoryV2CardPriceRow[],
  today?: string,
): BranchInventoryV2CardAmounts {
  const pricesByModel = pricePeriodsByModel(priceRows);

  let total = 0;
  let inStock = 0;
  let defective = 0;
  let offPlanogram = 0;
  for (const row of qtyRows) {
    const price = resolveInventoryCardUnitPrice(
      pricesByModel.get(row.modelId) ?? [],
      row.srp,
      today,
    );
    total += row.totalQty * price;
    inStock += row.inStockQty * price;
    defective += row.defectiveQty * price;
    offPlanogram += row.offPlanogramQty * price;
  }

  return {
    total: roundMoney(total),
    inStock: roundMoney(inStock),
    defective: roundMoney(defective),
    offPlanogram: roundMoney(offPlanogram),
  };
}

/**
 * Peso value of one branch's status cards.
 * Same unit price as the home cards: active price list, else the latest period
 * already started, general row preferred, then SRP, then zero.
 */
export function sumBranchInventoryV2StatusAmounts(
  qtyRows: readonly BranchInventoryV2StatusQtyRow[],
  priceRows: readonly BranchInventoryV2CardPriceRow[],
  today?: string,
): BranchInventoryV2StatusAmounts {
  const pricesByModel = pricePeriodsByModel(priceRows);
  let total = 0;
  let offPlanogram = 0;
  const byStatus: Record<string, number> = {};

  for (const row of qtyRows) {
    const price = resolveInventoryCardUnitPrice(
      pricesByModel.get(row.modelId) ?? [],
      row.srp,
      today,
    );
    total += row.totalQty * price;
    offPlanogram += row.offPlanogramQty * price;
    for (const [code, qty] of Object.entries(row.qtyByStatus)) {
      if (!Number.isFinite(qty) || qty === 0) continue;
      byStatus[code] = (byStatus[code] ?? 0) + qty * price;
    }
  }

  const roundedByStatus: Record<string, number> = {};
  for (const [code, amount] of Object.entries(byStatus)) {
    roundedByStatus[code] = roundMoney(amount);
  }

  return {
    total: roundMoney(total),
    offPlanogram: roundMoney(offPlanogram),
    byStatus: roundedByStatus,
  };
}
