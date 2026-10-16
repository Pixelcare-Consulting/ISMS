/** DEF is applied only through defect inspection — not the Stock units status dropdown. */
export function filterStatusCodesForStockUnitsDropdown<
  T extends { code: string },
>(codes: readonly T[]): T[] {
  return codes.filter((c) => c.code !== "DEF");
}
