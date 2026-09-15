type PriceListPeriodFields = {
  periodStart: string;
  periodEnd: string;
  packageTypeId: string | null;
};

function compareDisplayPriceRows(
  a: PriceListPeriodFields,
  b: PriceListPeriodFields,
): number {
  const aGeneral = a.packageTypeId === null;
  const bGeneral = b.packageTypeId === null;
  if (aGeneral !== bGeneral) return aGeneral ? -1 : 1;
  return b.periodStart.localeCompare(a.periodStart);
}

/** Picks the price-list row that is currently active (periodStart <= today <= periodEnd).
 * Prefers a general row (no packageType) over a package-specific one, then the most recent start.
 * Returns null if no row is active today.
 * Sales encode uses a separate server resolver that also falls back to the latest prior period. */
export function pickActivePriceListRow<T>(
  rows: T[],
  getPeriod: (row: T) => PriceListPeriodFields,
  today: string = new Date().toISOString().slice(0, 10),
): T | null {
  const active = rows.filter((row) => {
    const { periodStart, periodEnd } = getPeriod(row);
    return periodStart <= today && periodEnd >= today;
  });
  if (active.length === 0) return null;

  active.sort((a, b) => compareDisplayPriceRows(getPeriod(a), getPeriod(b)));
  return active[0];
}

/**
 * Display price for Planogram / Allowed models (same idea as Price list cards + Sales).
 * Active period when one exists; otherwise the latest period that already started.
 * Prefers a generic row (no package type) over a package-specific one.
 */
export function pickDisplayPriceListRow<T>(
  rows: T[],
  getPeriod: (row: T) => PriceListPeriodFields,
  today: string = new Date().toISOString().slice(0, 10),
): T | null {
  const active = pickActivePriceListRow(rows, getPeriod, today);
  if (active) return active;

  const started = rows.filter((row) => getPeriod(row).periodStart <= today);
  if (started.length === 0) return null;

  started.sort((a, b) => compareDisplayPriceRows(getPeriod(a), getPeriod(b)));
  return started[0];
}
