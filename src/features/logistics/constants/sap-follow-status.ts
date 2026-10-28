/**
 * UI copy for `delivery_sap_documents.status` (see sap-copy-to-follow.planner.ts).
 * The only place the stored values are turned into words and colours.
 */
export const SAP_FOLLOW_STATUS_LABELS: Record<string, string> = {
  APPLIED: "Applied",
  FAILED: "Not applied yet",
  FLAGGED: "Needs review",
};

export const SAP_FOLLOW_STATUS_TONES: Record<string, string> = {
  APPLIED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  FAILED: "border-amber-200 bg-amber-50 text-amber-900",
  FLAGGED: "border-red-200 bg-red-50 text-red-800",
};

/** What each status means for the person reading the delivery. */
export const SAP_FOLLOW_STATUS_HINTS: Record<string, string> = {
  FAILED: "ISMS retries this on its next SAP check once the problem below is fixed.",
  FLAGGED: "ISMS will not retry this. Check the document in SAP.",
};
