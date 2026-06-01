export function normalizeTableSearch(value: string) {
  return value.trim().toLowerCase();
}

export function matchesTableSearch(query: string, values: Array<string | null | undefined>) {
  const normalizedQuery = normalizeTableSearch(query);
  if (!normalizedQuery) {
    return true;
  }

  return values.some((value) =>
    (value ?? "").toLowerCase().includes(normalizedQuery),
  );
}
