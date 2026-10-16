import { MONTHLY_SIR_VARIANCE_LABELS } from "@/features/monthly-sir/constants/monthly-sir";

/** Statuses a P-Count upload may contain. DEF and STK are inventory codes; DU is delivered. */
export const PCOUNT_UPLOAD_STATUSES = ["DEF", "STK", "DU"] as const;

export type PcountUploadStatus = (typeof PCOUNT_UPLOAD_STATUSES)[number];

const LEGACY_MATCHED_REMARK = /^P-COUNT:\s*(STK|DEF|DU)$/i;
const LEGACY_VARIANCE_REMARK = /^P-COUNT:\s*VAR$/i;
const UNCATALOGUED_SERIAL_DESCRIPTION =
  /^Unexpected serial found during physical count \((.+)\)$/;

const CANONICAL_REMARKS = new Set<string>(
  Object.values(MONTHLY_SIR_VARIANCE_LABELS),
);

export function isPcountUploadStatus(value: string): value is PcountUploadStatus {
  const normalized = value.toUpperCase();
  return (PCOUNT_UPLOAD_STATUSES as readonly string[]).includes(normalized);
}

/**
 * Remark stored on a serial that is on the uploaded file.
 * Same split Generate Variance uses after the count is completed:
 * - not on the expected list → IN FILE NOT IN STK
 * - expected, and the system status differs from the counted status → IN FILE NOT IN STK
 * - expected and the same status → IN FILE AND IN STK
 * Expected units omitted from the file are STK NOT IN FILE and are stamped separately.
 */
export function pcountRemarkForUploadedRow(input: {
  pcount: string;
  expectedInCount: boolean;
  systemStatus: string | null | undefined;
}): string {
  const pcount = input.pcount.toUpperCase();
  if (!input.expectedInCount) return MONTHLY_SIR_VARIANCE_LABELS.surplus;
  const systemStatus = input.systemStatus?.toUpperCase() ?? "";
  if (systemStatus && systemStatus !== pcount) {
    return MONTHLY_SIR_VARIANCE_LABELS.status_mismatch;
  }
  return MONTHLY_SIR_VARIANCE_LABELS.matched;
}

/**
 * Sheet and report label for a count line.
 * Variance type wins, so older `P-COUNT:` notes still show the same labels.
 */
export function pcountDisplayRemark(input: {
  expectedInCount: boolean;
  lineStatus: string;
  varianceType?: string | null;
  notes?: string | null;
}): string {
  const fromType = remarkForVarianceType(input.varianceType);
  if (fromType) return fromType;

  if (!input.expectedInCount && input.lineStatus !== "pending") {
    return MONTHLY_SIR_VARIANCE_LABELS.surplus;
  }

  const notes = input.notes?.trim() ?? "";
  if (CANONICAL_REMARKS.has(notes)) return notes;
  if (LEGACY_MATCHED_REMARK.test(notes)) return MONTHLY_SIR_VARIANCE_LABELS.matched;
  if (LEGACY_VARIANCE_REMARK.test(notes)) {
    if (input.expectedInCount && input.lineStatus === "pending") {
      return MONTHLY_SIR_VARIANCE_LABELS.missing;
    }
    return MONTHLY_SIR_VARIANCE_LABELS.surplus;
  }

  if (
    input.expectedInCount &&
    (input.lineStatus === "counted" || input.lineStatus === "resolved")
  ) {
    return MONTHLY_SIR_VARIANCE_LABELS.matched;
  }

  return "";
}

function remarkForVarianceType(
  varianceType: string | null | undefined,
): string | null {
  if (varianceType === "missing") return MONTHLY_SIR_VARIANCE_LABELS.missing;
  if (varianceType === "surplus" || varianceType === "status_mismatch") {
    return MONTHLY_SIR_VARIANCE_LABELS.surplus;
  }
  if (varianceType === "matched") return MONTHLY_SIR_VARIANCE_LABELS.matched;
  return null;
}

/** Surplus variance text for a serial that is not in the catalog (no count line). */
export function uncataloguedSerialVarianceDescription(serialNo: string): string {
  return `Unexpected serial found during physical count (${serialNo.trim()})`;
}

/** Serial stored on a catalog-unknown surplus variance, if the description has one. */
export function serialFromUncataloguedVariance(
  description: string | null | undefined,
): string | null {
  if (!description) return null;
  const serialNo = UNCATALOGUED_SERIAL_DESCRIPTION.exec(description.trim())?.[1]?.trim();
  return serialNo ? serialNo : null;
}
