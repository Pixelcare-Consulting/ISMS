import type { StockCountSessionStatus } from "@prisma/client";

import { STOCK_COUNT_SESSION_LABELS } from "@/features/stock-audit/constants/stock-count-workflow";

/** Session statuses that count a branch as done for the month. */
export const PCOUNT_DONE_STATUSES: readonly StockCountSessionStatus[] = [
  "closed",
  "adjustment_requested",
] as const;

export type PcountCountingLabel =
  | "Not started"
  | "Open (draft)"
  | "Counting (open)"
  | "Counted"
  | "Closed";

export type PcountPostingLabel =
  | "—"
  | "No variances / review"
  | "Under investigation"
  | "Ready to post"
  | "Posting…"
  | "Posted · pending SAP"
  | "Posted / N/A";

export interface PcountDualStatus {
  counting: PcountCountingLabel;
  posting: PcountPostingLabel;
  /** True when the branch qualifies as done for month progress. */
  isDone: boolean;
  /** Session is postable via Post differences. */
  isPostable: boolean;
  /** Posted locally; SAP handoff may still be pending. */
  isPendingSap: boolean;
  /** Counting phase still open. */
  isCountingOpen: boolean;
}

export function isPcountDoneStatus(status: StockCountSessionStatus): boolean {
  return (PCOUNT_DONE_STATUSES as readonly string[]).includes(status);
}

/** Map session status → Counting | Posting dual columns (SAP B1-aligned). */
export function resolvePcountDualStatus(
  status: StockCountSessionStatus | null | undefined,
): PcountDualStatus {
  if (!status) {
    return {
      counting: "Not started",
      posting: "—",
      isDone: false,
      isPostable: false,
      isPendingSap: false,
      isCountingOpen: false,
    };
  }

  switch (status) {
    case "draft":
      return {
        counting: "Open (draft)",
        posting: "—",
        isDone: false,
        isPostable: false,
        isPendingSap: false,
        isCountingOpen: true,
      };
    case "in_progress":
      return {
        counting: "Counting (open)",
        posting: "—",
        isDone: false,
        isPostable: false,
        isPendingSap: false,
        isCountingOpen: true,
      };
    case "counting_complete":
      return {
        counting: "Counted",
        posting: "No variances / review",
        isDone: false,
        isPostable: false,
        isPendingSap: false,
        isCountingOpen: false,
      };
    case "variances_under_investigation":
      return {
        counting: "Counted",
        posting: "Under investigation",
        isDone: false,
        isPostable: false,
        isPendingSap: false,
        isCountingOpen: false,
      };
    case "pending_adjustment":
      return {
        counting: "Counted",
        posting: "Ready to post",
        isDone: false,
        isPostable: true,
        isPendingSap: false,
        isCountingOpen: false,
      };
    case "posting":
      return {
        counting: "Counted",
        posting: "Posting…",
        isDone: false,
        isPostable: false,
        isPendingSap: false,
        isCountingOpen: false,
      };
    case "adjustment_requested":
      return {
        counting: "Counted",
        posting: "Posted · pending SAP",
        isDone: true,
        isPostable: false,
        isPendingSap: true,
        isCountingOpen: false,
      };
    case "closed":
      return {
        counting: "Closed",
        posting: "Posted / N/A",
        isDone: true,
        isPostable: false,
        isPendingSap: false,
        isCountingOpen: false,
      };
    default: {
      const _exhaustive: never = status;
      void _exhaustive;
      return {
        counting: "Not started",
        posting: "—",
        isDone: false,
        isPostable: false,
        isPendingSap: false,
        isCountingOpen: false,
      };
    }
  }
}

export function sessionStatusLabel(status: StockCountSessionStatus): string {
  return STOCK_COUNT_SESSION_LABELS[status];
}
