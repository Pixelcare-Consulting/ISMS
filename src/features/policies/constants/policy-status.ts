export const POLICY_STATUSES = ["draft", "review", "approved"] as const;

export type PolicyStatus = (typeof POLICY_STATUSES)[number];

export function isPolicyStatus(value: string): value is PolicyStatus {
  return POLICY_STATUSES.includes(value as PolicyStatus);
}

export const POLICY_STATUS_LABELS: Record<PolicyStatus, string> = {
  draft: "Draft",
  review: "In review",
  approved: "Approved",
};
