/**
 * Demand Planning document numbers: DP-YYYYMM-nnn (sequence is 1-based).
 * Legacy DP-YYYYMMDD-nnn numbers stay unchanged.
 */
export function formatDemandPlanningDocumentNumber(
  periodStart: Date,
  sequence: number,
): string {
  const year = periodStart.getUTCFullYear();
  const month = String(periodStart.getUTCMonth() + 1).padStart(2, "0");
  const nnn = String(Math.max(1, Math.trunc(sequence))).padStart(3, "0");
  return `DP-${year}${month}-${nnn}`;
}

export function yearMonthKeyFromDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}${month}`;
}
