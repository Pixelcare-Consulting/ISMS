import { approvalRoleLabel } from "@/features/orders/lib/order-approval-timeline";

/** One approval level of a transfer, pull-out or order, as the approval tables store it. */
export interface ApprovalLevelRef {
  level: number;
  roleSlug: string;
  approvedAt: Date | null;
  approvedById: string | null;
  rejectedAt: Date | null;
  rejectedById: string | null;
  comment?: string | null;
}

export interface ApproverRef {
  name: string | null;
  email: string;
}

/**
 * Approvals are a different moment from the event row's own timestamp, so they carry the
 * time as well as the date. Manila time: the business runs there whatever the server's
 * time zone is.
 */
function formatApprovalTime(value: Date): string {
  return value.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function approverName(approver: ApproverRef | null | undefined): string | null {
  if (!approver) return null;
  return approver.name?.trim() || approver.email;
}

/**
 * One decision as a reference line: `Approved by Juan · Oct 23, 2026, 2:15 PM · Note: …`.
 * Null when the step has not happened.
 */
export function decisionReferenceLine(
  action: string,
  by: string | null,
  at: Date | null | undefined,
  note?: string | null,
): string | null {
  if (!at) return null;
  const comment = note?.trim();
  return `${action}${by ? ` by ${by}` : ""} · ${formatApprovalTime(at)}${comment ? ` · Note: ${comment}` : ""}`;
}

function decidedBy(
  role: string,
  userId: string | null,
  approversById: ReadonlyMap<string, ApproverRef>,
): string {
  const who = userId ? approverName(approversById.get(userId)) : null;
  return who ? `${role}: ${who}` : role;
}

/**
 * Reference lines saying who decided each approval level and when, in level order,
 * with the approver's comment. Undecided levels are left out. Rejections from before
 * rejectedById was recorded name only the role.
 */
export function approvalReferenceLines(
  levels: readonly ApprovalLevelRef[],
  approversById: ReadonlyMap<string, ApproverRef>,
): string[] {
  const lines: string[] = [];
  for (const level of [...levels].sort((a, b) => a.level - b.level)) {
    const role = approvalRoleLabel(level.roleSlug);
    const line = level.approvedAt
      ? decisionReferenceLine(
          "Approved",
          decidedBy(role, level.approvedById, approversById),
          level.approvedAt,
          level.comment,
        )
      : decisionReferenceLine(
          "Rejected",
          decidedBy(role, level.rejectedById, approversById),
          level.rejectedAt,
          level.comment,
        );
    if (line) lines.push(line);
  }
  return lines;
}

/** Approver and rejector ids across many records' levels, for one user lookup. */
export function approverIds(levelSets: readonly (readonly ApprovalLevelRef[])[]): string[] {
  const ids = new Set<string>();
  for (const levels of levelSets) {
    for (const level of levels) {
      if (level.approvedById) ids.add(level.approvedById);
      if (level.rejectedById) ids.add(level.rejectedById);
    }
  }
  return [...ids];
}

/** One audit-log step of a document's workflow, as the trail lines need it. */
export interface AuditTrailEntry {
  action: string;
  at: Date;
  by: ApproverRef | null;
  /** Set when the step decided one line (unit) rather than the whole document. */
  lineId: string | null;
  note: string | null;
}

/**
 * Reference lines for a document whose decisions live only in the audit log (unit
 * transfers, delivery returns), oldest first. Steps on other lines of the same
 * document are left out; document-wide steps apply to every line.
 */
export function auditTrailLines(
  entries: readonly AuditTrailEntry[],
  labels: Readonly<Record<string, string>>,
  lineId?: string,
): string[] {
  return [...entries]
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .flatMap((entry) => {
      const label = labels[entry.action];
      if (!label) return [];
      if (entry.lineId && entry.lineId !== lineId) return [];
      const line = decisionReferenceLine(label, approverName(entry.by), entry.at, entry.note);
      return line ? [line] : [];
    });
}
