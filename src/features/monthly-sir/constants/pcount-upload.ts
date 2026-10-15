/** Statuses a P-Count upload may contain. DEF and STK are inventory codes; DU is delivered. */
export const PCOUNT_UPLOAD_STATUSES = ["DEF", "STK", "DU"] as const;

export type PcountUploadStatus = (typeof PCOUNT_UPLOAD_STATUSES)[number];

/** Remark written on rows Generate Variance classifies as a variance. */
export const PCOUNT_VARIANCE_REMARK = "P-COUNT: VAR";

export function isPcountUploadStatus(value: string): value is PcountUploadStatus {
  const normalized = value.toUpperCase();
  return (PCOUNT_UPLOAD_STATUSES as readonly string[]).includes(normalized);
}

/**
 * Remark for a serial that is on the uploaded file.
 * Same split Generate Variance uses after the count is completed:
 * - not on the expected list → surplus ("IN FILE NOT IN STK")
 * - expected, and the system status differs from the counted status → status mismatch
 * Expected units omitted from the file are missing ("STK NOT IN FILE") and are
 * stamped separately with the same variance remark.
 */
export function pcountRemarkForUploadedRow(input: {
  pcount: string;
  expectedInCount: boolean;
  systemStatus: string | null | undefined;
}): string {
  const pcount = input.pcount.toUpperCase();
  if (!input.expectedInCount) return PCOUNT_VARIANCE_REMARK;
  const systemStatus = input.systemStatus?.toUpperCase() ?? "";
  if (systemStatus && systemStatus !== pcount) return PCOUNT_VARIANCE_REMARK;
  return `P-COUNT: ${pcount}`;
}
