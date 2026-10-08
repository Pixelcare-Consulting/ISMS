/** Company DB names that are safe to read for a live placement trial. */
const ISOLATED_TEST_COMPANY = /SBODEMO|(?:^|[^A-Za-z])(TEST|DEMO|SANDBOX)(?:[^A-Za-z]|$)/i;

export function isIsolatedSapTestCompany(companyDb: string): boolean {
  return ISOLATED_TEST_COMPANY.test(companyDb.trim());
}

/**
 * Serials that are not already in warehouse stock. A second receive of the
 * same ids creates nothing.
 */
export function newWarehouseSerialIds(existingIds: Iterable<string>, incomingIds: string[]): string[] {
  const existing = new Set(existingIds);
  const seen = new Set<string>();
  const fresh: string[] = [];
  for (const id of incomingIds) {
    if (existing.has(id) || seen.has(id)) continue;
    seen.add(id);
    fresh.push(id);
  }
  return fresh;
}
