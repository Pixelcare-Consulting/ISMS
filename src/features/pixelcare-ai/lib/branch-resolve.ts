export type PermittedBranchRef = {
  id: string;
  name: string;
  sapCode: string;
};

/** Normalize SAP-like codes so O/0 and I/1 slips still match a unique branch. */
export function normalizeSapCodeKey(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/O/g, "0")
    .replace(/I/g, "1");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i += 1) {
    let prev = i;
    row[0] = i + 1;
    for (let j = 0; j < b.length; j += 1) {
      const next = a[i] === b[j] ? prev : Math.min(prev, row[j]!, row[j + 1]!) + 1;
      prev = row[j + 1]!;
      row[j + 1] = next;
    }
  }
  return row[b.length]!;
}

/**
 * Resolve a branch ref (cuid id, SAP code, or display name) within the
 * caller's permitted set. Never invents a branch outside that set.
 */
export function resolvePermittedBranchRef(
  permitted: PermittedBranchRef[],
  ref: string,
): PermittedBranchRef | null {
  const trimmed = ref.trim();
  if (!trimmed) return null;

  const byId = permitted.find((b) => b.id === trimmed);
  if (byId) return byId;

  const upper = trimmed.toUpperCase();
  const bySapExact = permitted.filter((b) => b.sapCode?.trim().toUpperCase() === upper);
  if (bySapExact.length === 1) return bySapExact[0]!;
  if (bySapExact.length > 1) return null;

  const lower = trimmed.toLowerCase();
  const byName = permitted.filter((b) => b.name.trim().toLowerCase() === lower);
  if (byName.length === 1) return byName[0]!;
  if (byName.length > 1) return null;

  const normalizedRef = normalizeSapCodeKey(trimmed);
  const bySapNormalized = permitted.filter(
    (b) => normalizeSapCodeKey(b.sapCode ?? "") === normalizedRef,
  );
  if (bySapNormalized.length === 1) return bySapNormalized[0]!;

  // Unique near-miss SAP (e.g. ABPOO1 vs ABP001) within AOR only.
  if (trimmed.length >= 3 && trimmed.length <= 32) {
    const close = permitted.filter((b) => {
      const sap = b.sapCode?.trim().toUpperCase() ?? "";
      if (!sap) return false;
      if (Math.abs(sap.length - upper.length) > 1) return false;
      return (
        levenshtein(sap, upper) <= 1 ||
        levenshtein(normalizeSapCodeKey(sap), normalizedRef) <= 1
      );
    });
    if (close.length === 1) return close[0]!;
  }

  return null;
}
