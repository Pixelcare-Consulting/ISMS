import { approvalRoleLabel } from "@/features/orders/lib/order-approval-timeline";

/** One approval level of a transfer, pull-out or order, as the approval tables store it. */
export interface ApprovalLevelRef {
  level: number;
  roleSlug: string;
  approvedAt: Date | null;
  approvedById: string | null;
  rejectedAt: Date | null;
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

function approverName(approver: ApproverRef | undefined): string | null {
  if (!approver) return null;
  return approver.name?.trim() || approver.email;
}

/**
 * Reference lines saying who decided each approval level and when, in level order.
 * Undecided levels are left out. A rejection names no one: the approval tables keep
 * when a level was rejected, not by whom.
 */
export function approvalReferenceLines(
  levels: readonly ApprovalLevelRef[],
  approversById: ReadonlyMap<string, ApproverRef>,
): string[] {
  const lines: string[] = [];
  for (const level of [...levels].sort((a, b) => a.level - b.level)) {
    const role = approvalRoleLabel(level.roleSlug);
    if (level.approvedAt) {
      const who = level.approvedById ? approverName(approversById.get(level.approvedById)) : null;
      lines.push(
        `Approved by ${role}${who ? `: ${who}` : ""} · ${formatApprovalTime(level.approvedAt)}`,
      );
    } else if (level.rejectedAt) {
      lines.push(`Rejected by ${role} · ${formatApprovalTime(level.rejectedAt)}`);
    }
  }
  return lines;
}

/** Approver ids across many records' levels, for one user lookup. */
export function approverIds(levelSets: readonly (readonly ApprovalLevelRef[])[]): string[] {
  const ids = new Set<string>();
  for (const levels of levelSets) {
    for (const level of levels) if (level.approvedById) ids.add(level.approvedById);
  }
  return [...ids];
}
