"use client";

import {
  ProgressCompletedMark,
  ProgressCurrentMark,
  ProgressLink,
  ProgressStagePopover,
  ProgressStageSummary,
  progressSummaryParts,
  type ProgressNode,
} from "@/app/(app)/logistics/_components/progress-tracker";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import {
  formatOrderHistoryWhen,
  type OrderTrackerNode,
  type OrderTrackerState,
} from "@/features/orders/lib/order-history-tracker";
import { cn } from "@/utils/cn";

function stateText(state: OrderTrackerState): string {
  switch (state) {
    case "completed": 
      return "Completed";
    case "current":
      return "Current";
    case "upcoming":
      return "Not started";
    case "cancelled":
      return "Cancelled";
    case "rejected":
      return "Rejected";
    default: {
      const unreachable: never = state;
      return unreachable;
    }
  }
} 
  
function TerminalMark() {
  return (
    <span className="relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border border-destructive bg-card text-destructive">
      <span className="text-sm leading-none" aria-hidden>
        ×
      </span>
    </span>
  );
}

function StepMark({ state, delayMs }: { state: OrderTrackerState; delayMs: number }) {
  const base =
    "relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border bg-card";
  switch (state) {
    case "completed":
      return <ProgressCompletedMark delayMs={delayMs} />;
    case "current":
      return <ProgressCurrentMark />;
    case "upcoming":
      return <span className={cn(base, "border-border")} />;
    case "cancelled":
      return <TerminalMark />;
    case "rejected":
      return <TerminalMark />;
    default: {
      const unreachable: never = state;
      return unreachable;
    }
  }
}

function summaryNodes(items: readonly OrderTrackerNode[]): ProgressNode[] {
  return items.map((item) => ({
    key: item.key,
    label: item.label,
    state: item.state === "rejected" ? "cancelled" : item.state,
    at: item.at,
    color: null,
  }));
}

export function OrderHistoryTracker({ items }: { items: OrderTrackerNode[] }) {
  const summary = progressSummaryParts(summaryNodes(items));

  return (
    <div>
      {summary ? <ProgressStageSummary lead={summary.lead} detail={summary.detail} /> : null}
      <ol aria-label="Order progress" className="flex flex-col sm:flex-row sm:items-start">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          const when = item.state === "upcoming" ? null : formatOrderHistoryWhen(item.at);
          const previous = index > 0 ? items[index - 1] : null;
          const delayMs = index * 80;
          return (
            <li
              key={item.key}
              className="relative flex min-w-0 flex-1"
              aria-current={item.state === "current" ? "step" : undefined}
            >
              {index > 0 ? (
                <ProgressLink
                  direction="horizontal"
                  filled={previous?.state === "completed"}
                  delayMs={(index - 1) * 80}
                />
              ) : null}
              <ProgressStagePopover label={item.label} events={item.events} className="sm:gap-2">
                <div className="relative flex w-6 shrink-0 justify-center sm:w-auto">
                  <StepMark state={item.state} delayMs={delayMs} />
                  {last ? null : (
                    <ProgressLink
                      direction="vertical"
                      filled={item.state === "completed"}
                      delayMs={delayMs}
                    />
                  )}
                </div>
                <div className={cn("min-w-0 sm:px-2", last ? "pb-0" : "pb-5 sm:pb-0")}>
                  <span className="sr-only">{stateText(item.state)}. </span>
                  {item.badge ? (
                    <StatusCodeBadge code={item.badge.code} name={item.badge.name} />
                  ) : (
                    <p
                      className={cn(
                        "text-sm underline-offset-2 group-hover:underline",
                        item.state === "upcoming" ? "text-muted-foreground" : "text-foreground",
                        item.state === "current" && "font-medium",
                      )}
                    >
                      {item.label}
                    </p>
                  )}
                  {item.state === "upcoming" ? null : (
                    <p className="text-xs text-muted-foreground">
                      {when ?? "Time unavailable"}
                    </p>
                  )}
                </div>
              </ProgressStagePopover>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
