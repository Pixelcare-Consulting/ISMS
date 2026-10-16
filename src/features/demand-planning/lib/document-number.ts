/**
 * Supply Planning document numbers: SP-YYYYMM-nnn (sequence is 1-based).
 * Legacy DP-YYYYMM-nnn / DP-YYYYMMDD-nnn numbers stay unchanged in the DB.
 * Existing DP-YYYYMM-nnn numbers are still counted when allocating the next
 * sequence so creates do not collide with historical docs.
 */

export const DEMAND_PLANNING_DOCUMENT_PREFIX = "SP" as const;
/** Historical prefix kept only for sequence allocation / collision avoidance. */
export const LEGACY_DP_DOCUMENT_PREFIX = "DP" as const;

export function yearMonthKeyFromDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}${month}`;
}

export function formatDemandPlanningDocumentNumber(
  periodStart: Date,
  sequence: number,
): string {
  const yearMonth = yearMonthKeyFromDate(periodStart);
  const nnn = String(Math.max(1, Math.trunc(sequence))).padStart(3, "0");
  return `${DEMAND_PLANNING_DOCUMENT_PREFIX}-${yearMonth}-${nnn}`;
}

/** Prefixes whose sequences share one allocator for a planning month. */
export function documentNumberPrefixesForPeriod(periodStart: Date): string[] {
  const yearMonth = yearMonthKeyFromDate(periodStart);
  return [
    `${DEMAND_PLANNING_DOCUMENT_PREFIX}-${yearMonth}-`,
    `${LEGACY_DP_DOCUMENT_PREFIX}-${yearMonth}-`,
  ];
}

/**
 * Parse the trailing sequence from a document number given its known prefix.
 * Returns NaN when the suffix is not a finite integer.
 */
export function parseDocumentSequence(documentNumber: string, prefix: string): number {
  if (!documentNumber.startsWith(prefix)) return Number.NaN;
  return Number.parseInt(documentNumber.slice(prefix.length), 10);
}

/**
 * Next 1-based sequence after the highest sequence found under any of the prefixes.
 * Pure helper for unit tests; repository applies the same rule against the DB.
 */
export function nextDocumentSequence(
  documentNumbers: string[],
  prefixes: string[],
): number {
  let maxSeq = 0;
  for (const documentNumber of documentNumbers) {
    for (const prefix of prefixes) {
      const seq = parseDocumentSequence(documentNumber, prefix);
      if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
    }
  }
  return maxSeq + 1;
}
