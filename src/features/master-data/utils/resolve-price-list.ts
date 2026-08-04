/** Picks the price-list row that is currently active (periodStart <= today <= periodEnd).
 * Prefers a general row (no packageType) over a package-specific one, then the most recent start.
 * Returns null if no row is active today.
 * Sales encode uses a separate server resolver that also falls back to the latest prior period. */
export function pickActivePriceListRow<T>(
  rows: T[],
  getPeriod: (row: T) => { periodStart: string; periodEnd: string; packageTypeId: string | null },
  today: string = new Date().toISOString().slice(0, 10),
): T | null {
  const active = rows.filter((row) => {
    const { periodStart, periodEnd } = getPeriod(row);
    return periodStart <= today && periodEnd >= today;
  });
  if (active.length === 0) return null;

  active.sort((a, b) => {
    const periodA = getPeriod(a);
    const periodB = getPeriod(b);
    const aGeneral = periodA.packageTypeId === null;
    const bGeneral = periodB.packageTypeId === null;
    if (aGeneral !== bGeneral) return aGeneral ? -1 : 1;
    return periodB.periodStart.localeCompare(periodA.periodStart);
  });
  return active[0];
}
