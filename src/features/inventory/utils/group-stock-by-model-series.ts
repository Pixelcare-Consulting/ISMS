/**
 * Placeholder when a model has no series in Master data.
 * Matches the Models list, which shows this dash for an empty series.
 */
export const NO_MODEL_SERIES_LABEL = "—";

export type ModelSeriesStockRow = {
  /** Series name stored on the product model. Null when Master data has none. */
  seriesName: string | null;
  srp: number;
  qty: number;
};

export type ModelSeriesStockSummary = {
  rows: Array<{ series: string; qty: number; value: number }>;
  totalQty: number;
  totalValue: number;
};

/** Roll stock up by the series saved on the model, not by the SKU text. */
export function groupStockByModelSeries(
  rows: ModelSeriesStockRow[],
): ModelSeriesStockSummary {
  const bySeries = new Map<string, { qty: number; value: number }>();

  for (const row of rows) {
    const trimmed = row.seriesName?.trim() ?? "";
    const series = trimmed.length > 0 ? trimmed : NO_MODEL_SERIES_LABEL;
    const current = bySeries.get(series) ?? { qty: 0, value: 0 };
    current.qty += row.qty;
    current.value += row.srp * row.qty;
    bySeries.set(series, current);
  }

  const summaryRows = Array.from(bySeries.entries())
    .map(([series, agg]) => ({
      series,
      qty: agg.qty,
      value: agg.value,
    }))
    .sort((a, b) => a.series.localeCompare(b.series));

  return {
    rows: summaryRows,
    totalQty: summaryRows.reduce((sum, row) => sum + row.qty, 0),
    totalValue: summaryRows.reduce((sum, row) => sum + row.value, 0),
  };
}
