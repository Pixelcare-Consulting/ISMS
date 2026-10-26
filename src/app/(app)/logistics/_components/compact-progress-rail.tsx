"use client";

import {
  ProgressStageMark,
  progressSummaryParts,
  type ProgressNode,
  type ProgressStepState,
} from "@/app/(app)/logistics/_components/progress-tracker";
import { cn } from "@/utils/cn";

function stateWord(state: ProgressStepState): string {
  switch (state) {
    case "completed":
      return "Completed";
    case "current":
      return "Current";
    case "upcoming":
      return "Not started";
    case "cancelled":
      return "Stopped";
    default: {
      const unreachable: never = state;
      return unreachable;
    }
  }
}

function StepDot({ state }: { state: ProgressStepState }) {
  switch (state) {
    case "completed":
      return <span className="inline-block size-2.5 shrink-0 rounded-full bg-primary" />;
    case "current":
      return (
        <span className="inline-flex size-2.5 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-card">
          <span className="size-1 rounded-full bg-primary" />
        </span>
      );
    case "upcoming":
      return (
        <span className="inline-block size-2.5 shrink-0 rounded-full border border-border bg-muted" />
      );
    case "cancelled":
      return <span className="inline-block size-2.5 shrink-0 rounded-full bg-rose-500" />;
    default: {
      const unreachable: never = state;
      return unreachable;
    }
  }
}

function connectorClass(previous: ProgressNode | undefined): string {
  if (previous?.state === "completed") return "bg-emerald-500";
  return "bg-border";
}

/** One-row rail for a list. Callers pass nodes from the existing document tracker. */
export function CompactProgressRail({
  ariaLabel,
  items,
}: {
  ariaLabel: string;
  items: readonly ProgressNode[];
}) {
  const summary = progressSummaryParts(items);
  const summaryText = summary
    ? summary.detail
      ? `${summary.lead}: ${summary.detail}`
      : summary.lead
    : null;

  return (
    <ol
      aria-label={summaryText ? `${ariaLabel}. ${summaryText}` : ariaLabel}
      className="flex w-52 items-center"
    >
      {items.map((item, index) => {
        const previous = index > 0 ? items[index - 1] : undefined;
        return (
          <li
            key={item.key}
            className={cn("flex items-center", index > 0 && "min-w-0 flex-1")}
            aria-current={item.state === "current" ? "step" : undefined}
            aria-label={`${item.label}, ${stateWord(item.state)}`}
          >
            {index > 0 ? (
              <span
                className={cn("h-0.5 min-w-1.5 flex-1", connectorClass(previous))}
                aria-hidden
              />
            ) : null}
            <span title={item.label} className="inline-flex shrink-0">
              {item.icon ? (
                <ProgressStageMark icon={item.icon} state={item.state} size="compact" />
              ) : (
                <StepDot state={item.state} />
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
