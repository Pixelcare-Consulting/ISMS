import {
  sumBranchInventoryV2StatusAmounts,
  type BranchInventoryV2CardPriceRow,
  type BranchInventoryV2StatusAmounts,
} from "@/features/inventory/utils/branch-inventory-v2-card-amounts";
import { BRANCH_INVENTORY_V2_HIDDEN_STATUS_CODES } from "@/features/inventory/utils/branch-inventory-v2";
import {
  groupStockByModelSeries,
  type ModelSeriesStockSummary,
} from "@/features/inventory/utils/group-stock-by-model-series";

/**
 * Service Center Inventory, read-only, laid out like Branch Inventory: cards, one row per
 * center with units per status, and a center screen with its status strip. Everything here
 * comes from one aggregate (center × model × status) so the page makes a single count query.
 * Peso amounts use the Branch Inventory price rule (active price list, else SRP).
 */

/** Sold units leave the screen, as on Branch Inventory. */
export const SC_INVENTORY_HIDDEN_STATUS_CODES = BRANCH_INVENTORY_V2_HIDDEN_STATUS_CODES;

/** One count from the aggregate query. */
export interface ScInventoryAggregateRow {
  serviceCenterId: string;
  centerName: string;
  centerSapCode: string;
  modelId: string;
  skuCode: string;
  modelName: string;
  srp: number | null;
  seriesName: string | null;
  statusCode: string;
  qty: number;
}

export interface ScInventoryCenterRow {
  center: { id: string; name: string; sapCode: string };
  total: number;
  /** Units per status code at this center. */
  statusCounts: Record<string, number>;
}

/** The four home cards. DIT replaces Branch Inventory's off-planogram card. */
export interface ScInventoryCards {
  total: { qty: number; amount: number };
  inStock: { qty: number; amount: number };
  defective: { qty: number; amount: number };
  inTransit: { qty: number; amount: number };
}

export interface ScInventoryOverview {
  centers: ScInventoryCenterRow[];
  cards: ScInventoryCards;
  /** Center with the most defective units, for the Defective card's note. */
  topDefectiveCenter: string | null;
  seriesSummary: ModelSeriesStockSummary;
}

/** Quantity per model with each status, the shape the shared amount rule takes. */
function qtyRowsByModel(rows: readonly ScInventoryAggregateRow[]) {
  const byModel = new Map<string, { modelId: string; srp: number | null; totalQty: number; qtyByStatus: Record<string, number> }>();
  for (const row of rows) {
    const current = byModel.get(row.modelId) ?? { modelId: row.modelId, srp: row.srp, totalQty: 0, qtyByStatus: {} };
    current.totalQty += row.qty;
    current.qtyByStatus[row.statusCode] = (current.qtyByStatus[row.statusCode] ?? 0) + row.qty;
    byModel.set(row.modelId, current);
  }
  return [...byModel.values()].map((row) => ({ ...row, offPlanogramQty: 0 }));
}

/** Peso value of each status (and the total) for these rows. */
export function scInventoryStatusAmounts(
  rows: readonly ScInventoryAggregateRow[],
  priceRows: readonly BranchInventoryV2CardPriceRow[],
  today?: string,
): BranchInventoryV2StatusAmounts {
  return sumBranchInventoryV2StatusAmounts(qtyRowsByModel(rows), priceRows, today);
}

function card(rows: readonly ScInventoryAggregateRow[], amounts: BranchInventoryV2StatusAmounts, code: string) {
  return {
    qty: rows.reduce((sum, row) => sum + (row.statusCode === code ? row.qty : 0), 0),
    amount: amounts.byStatus[code] ?? 0,
  };
}

export interface ScInventoryCenterRef {
  id: string;
  name: string;
  sapCode: string;
}

/**
 * `centers` are the centers the user covers: each gets a row even with no units, so a
 * center's empty stock is visible rather than missing.
 */
export function buildScInventoryOverview(
  rows: readonly ScInventoryAggregateRow[],
  priceRows: readonly BranchInventoryV2CardPriceRow[],
  centers: readonly ScInventoryCenterRef[] = [],
  today?: string,
): ScInventoryOverview {
  const byCenter = new Map<string, ScInventoryCenterRow>();
  for (const center of centers) {
    byCenter.set(center.id, { center: { ...center }, total: 0, statusCounts: {} });
  }
  for (const row of rows) {
    const current = byCenter.get(row.serviceCenterId) ?? {
      center: { id: row.serviceCenterId, name: row.centerName, sapCode: row.centerSapCode },
      total: 0,
      statusCounts: {},
    };
    current.total += row.qty;
    current.statusCounts[row.statusCode] = (current.statusCounts[row.statusCode] ?? 0) + row.qty;
    byCenter.set(row.serviceCenterId, current);
  }
  const centerRows = [...byCenter.values()].sort((a, b) =>
    a.center.name.localeCompare(b.center.name, undefined, { sensitivity: "base" }),
  );

  const amounts = scInventoryStatusAmounts(rows, priceRows, today);
  const topDefective = centerRows
    .filter((row) => (row.statusCounts.DEF ?? 0) > 0)
    .sort((a, b) => (b.statusCounts.DEF ?? 0) - (a.statusCounts.DEF ?? 0))[0];

  return {
    centers: centerRows,
    cards: {
      total: { qty: centerRows.reduce((sum, row) => sum + row.total, 0), amount: amounts.total },
      inStock: card(rows, amounts, "STK"),
      defective: card(rows, amounts, "DEF"),
      inTransit: card(rows, amounts, "DIT"),
    },
    topDefectiveCenter: topDefective?.center.name ?? null,
    // Same as Branch Inventory's series panel: quantity times SRP.
    seriesSummary: groupStockByModelSeries(
      rows.map((row) => ({ seriesName: row.seriesName, srp: row.srp ?? 0, qty: row.qty })),
    ),
  };
}

export interface ScInventoryStatusRef {
  code: string;
  name: string;
  color: string | null;
}

/**
 * Status columns and strip cards: the statuses that have units here, in the tenant's
 * status order. A code missing from the active list (renamed or retired) still shows.
 */
export function scInventoryStatuses(
  statusOptions: readonly ScInventoryStatusRef[],
  rows: readonly ScInventoryAggregateRow[],
): (ScInventoryStatusRef & { count: number })[] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.statusCode, (counts.get(row.statusCode) ?? 0) + row.qty);
  const known = statusOptions
    .filter((status) => (counts.get(status.code) ?? 0) > 0)
    .map((status) => ({ ...status, count: counts.get(status.code) ?? 0 }));
  const knownCodes = new Set(known.map((status) => status.code));
  const unknown = [...counts]
    .filter(([code, count]) => count > 0 && !knownCodes.has(code))
    .map(([code, count]) => ({ code, name: code, color: null, count }));
  return [...known, ...unknown];
}

/** Models with units at one center, for its model filter. */
export function scInventoryModelOptions(rows: readonly ScInventoryAggregateRow[]): { sku: string; name: string }[] {
  const bySku = new Map<string, string>();
  for (const row of rows) if (row.qty > 0 && !bySku.has(row.skuCode)) bySku.set(row.skuCode, row.modelName);
  return [...bySku]
    .map(([sku, name]) => ({ sku, name }))
    .sort((a, b) => a.sku.localeCompare(b.sku, undefined, { sensitivity: "base" }));
}

/** Days a unit has been at the center: since its DR date, else since it was placed there. */
export function scInventoryAgingDays(drDate: Date | null, placedAt: Date, now: Date = new Date()): number {
  const anchor = drDate ?? placedAt;
  return Math.max(0, Math.floor((now.getTime() - anchor.getTime()) / 86_400_000));
}
