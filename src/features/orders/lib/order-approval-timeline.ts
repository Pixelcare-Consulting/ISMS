import type { BranchOrderType } from "@prisma/client";

import { getOrderApprovalChain } from "@/features/orders/constants/order-workflow";

export type ApprovalTimelineOutcome = "pending" | "approved" | "rejected";

export interface ApprovalTimelineSource {
  level: number;
  roleSlug: string;
  approvedAt?: string | Date | null;
  rejectedAt?: string | Date | null;
  comment?: string | null;
  approvedBy?: { name: string | null; email: string } | null;
}

export interface ApprovalTimelineStep {
  key: string;
  level: number;
  roleLabel: string;
  outcome: ApprovalTimelineOutcome;
  person: string | null;
  occurredAt: string | Date | null;
  comment: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  ps: "Product Specialist",
  tl: "Team Leader",
  sp: "Supply Planning",
  spa: "Supply Planning",
  logistics: "Logistics",
};

/** Display name of an approval level's role ("tl" → "Team Leader"). */
export function approvalRoleLabel(roleSlug: string): string {
  return ROLE_LABELS[roleSlug] ?? roleSlug;
}

function roleLabel(roleSlug: string): string {
  return ROLE_LABELS[roleSlug] ?? roleSlug;
}

function personName(level: ApprovalTimelineSource | undefined): string | null {
  const name = level?.approvedBy?.name?.trim();
  if (name) return name;
  const email = level?.approvedBy?.email?.trim();
  return email || null;
}

function outcomeFor(level: ApprovalTimelineSource | undefined): ApprovalTimelineOutcome {
  if (!level) return "pending";
  if (level.rejectedAt) return "rejected";
  if (level.approvedAt) return "approved";
  return "pending";
}

function occurredAtFor(level: ApprovalTimelineSource | undefined): string | Date | null {
  if (!level) return null;
  return level.rejectedAt ?? level.approvedAt ?? null;
}

function commentFor(level: ApprovalTimelineSource | undefined): string | null {
  const comment = level?.comment?.trim();
  return comment ? comment : null;
}

function toStep(
  roleLabelText: string,
  roleSlug: string,
  level: number,
  record: ApprovalTimelineSource | undefined,
): ApprovalTimelineStep {
  return {
    key: `${level}-${roleSlug}`,
    level,
    roleLabel: roleLabelText,
    outcome: outcomeFor(record),
    person: personName(record),
    occurredAt: occurredAtFor(record),
    comment: commentFor(record),
  };
}

/**
 * Full approval path. Steps with no decision stay pending so the line is
 * visible before anyone acts. Recorded steps outside the current path are kept.
 */
export function buildApprovalTimeline(
  orderType: BranchOrderType,
  levels: readonly ApprovalTimelineSource[],
): ApprovalTimelineStep[] {
  const chain = getOrderApprovalChain(orderType);
  const chainLevels = new Set(chain.map((step) => step.level));
  const steps = chain.map((step) =>
    toStep(
      step.label,
      step.roleSlug,
      step.level,
      levels.find((level) => level.level === step.level),
    ),
  );

  const extras = levels
    .filter((level) => !chainLevels.has(level.level))
    .slice()
    .sort((a, b) => a.level - b.level || a.roleSlug.localeCompare(b.roleSlug));

  for (const record of extras) {
    steps.push(toStep(roleLabel(record.roleSlug), record.roleSlug, record.level, record));
  }

  return steps;
}
