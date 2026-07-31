/** Strip trailing digits from a SKU to derive series (e.g. `32STV104` → `32STV`). */
export function deriveSkuSeries(skuCode: string): string {
  const trimmed = skuCode.trim();
  const series = trimmed.replace(/\d+$/, "");
  return series.length > 0 ? series : trimmed;
}

/** Whole calendar days between `from` and `to` (floored, never negative). */
export function wholeDaysBetween(from: Date, to: Date = new Date()): number {
  const ms = to.getTime() - from.getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}
