export function normalizeTableSearch(value: string) {
  return value.trim().toLowerCase().replace(/[_\s]+/g, " ");
}

export function matchesTableSearch(query: string, values: Array<string | null | undefined>) {
  const normalizedQuery = normalizeTableSearch(query);
  if (!normalizedQuery) {
    return true;
  }

  return values.some((value) =>
    normalizeTableSearch(value ?? "").includes(normalizedQuery),
  );
}
