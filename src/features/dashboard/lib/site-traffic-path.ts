/** App path stored for Site Traffic. Query strings and hashes are dropped. */
export function normalizeSitePath(path: string): string | null {
  const trimmed = path.trim();
  if (!trimmed.startsWith("/")) return null;
  const withoutQuery = trimmed.split("?")[0]?.split("#")[0] ?? "";
  if (!withoutQuery.startsWith("/")) return null;
  if (withoutQuery.startsWith("/api") || withoutQuery.startsWith("/_next")) {
    return null;
  }
  if (withoutQuery.length > 1 && withoutQuery.endsWith("/")) {
    return withoutQuery.slice(0, -1);
  }
  return withoutQuery;
}

/**
 * A refresh of the same address keeps the stored time.
 * Opening a different address stamps `now`.
 */
export function nextPathVisit(input: {
  previousPath: string | null;
  previousAt: Date | null;
  path: string;
  now: Date;
}): { path: string; at: Date; changed: boolean } {
  if (input.previousPath === input.path && input.previousAt) {
    return { path: input.previousPath, at: input.previousAt, changed: false };
  }
  return { path: input.path, at: input.now, changed: true };
}
