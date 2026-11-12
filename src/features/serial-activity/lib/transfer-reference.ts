type TransferDecision = "accepted" | "rejected";

interface TransferLineReference {
  rsNo: string | null;
  drNo: string | null;
  decision: string;
  remarks: string | null;
  requestRemarks: string | null;
}

function decisionLine(decision: string, remarks: string | null): string | null {
  if (decision === "accepted") return "Accepted";
  if (decision !== "rejected") return null;
  const reason = remarks?.trim();
  return reason ? `Rejected: ${reason}` : "Rejected";
}

/** A serial's outcome and slip numbers on a transfer, as serial log reference lines. */
export function transferReferenceLines(line: TransferLineReference): string[] {
  const slips = [line.rsNo && `RS ${line.rsNo}`, line.drNo && `DR ${line.drNo}`]
    .filter(Boolean)
    .join(" · ");
  const requestRemark = line.requestRemarks?.trim();
  return [
    slips,
    requestRemark ? `Request remark: ${requestRemark}` : null,
    decisionLine(line.decision, line.remarks),
  ].filter((part): part is string => Boolean(part));
}

/** How the ledger entry for an accepted or rejected serial opens. */
export function transferDecisionPrefix(decision: TransferDecision, transferNo: string): string {
  return `${decision === "accepted" ? "Accepted" : "Rejected"} on ${transferNo}.`;
}

/** The ledger entry for this decision, which holds the approval date, approver and slip numbers. */
export function transferDecisionLedgerText(
  transferNo: string,
  decision: TransferDecision,
  history: readonly { txnType: string; details: string | null }[],
): string | null {
  const prefix = transferDecisionPrefix(decision, transferNo);
  const entry = history.find(
    (row) => row.txnType === "transfer" && row.details?.startsWith(prefix),
  );
  return entry?.details ?? null;
}
