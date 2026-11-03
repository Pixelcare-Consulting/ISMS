/** `sapDocRef` is the job's reference, e.g. "SO-97580" or "ITR-12345". */
export type SapPostRead = { ok: true; sapDocRef: string } | { ok: false; sapMessage: string | null };

/** One inline job run read as posted, or not with SAP's own message. Success is a completed document. */
export function readSapPostResult(
  results: { status: string; sapDocRef?: string; error?: string }[] | null | undefined,
): SapPostRead {
  const result = results?.[0];
  if (result?.status === "completed" && result.sapDocRef) return { ok: true, sapDocRef: result.sapDocRef };
  const sapMessage = result?.error?.trim();
  return { ok: false, sapMessage: sapMessage ? sapMessage : null };
}
