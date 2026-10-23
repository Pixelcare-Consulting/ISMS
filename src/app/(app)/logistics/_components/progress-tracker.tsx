"use client";

import { Check } from "lucide-react";

import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import { cn } from "@/utils/cn";

export type ProgressStepState = "completed" | "current" | "upcoming" | "cancelled";

export interface ProgressNode {
  key: string;
  label: string;
  state: ProgressStepState;
  at: string | null;
  color: string | null;
  /** Badge code for a stopped step. Defaults to cancelled. */
  badgeCode?: string;
}

const TRACKER_TIME = new Intl.DateTimeFormat("en-PH", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Manila",
});

function formatWhen(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return TRACKER_TIME.format(date);
}

function stateText(state: ProgressStepState): string {
  switch (state) {
    case "completed":
      return "Completed";
    case "current":
      return "Current";
    case "upcoming":
      return "Not started";
    case "cancelled":
      return "Cancelled";
    default: {
      const unreachable: never = state;
      return unreachable;
    }
  }
}

function StepMark({ state }: { state: ProgressStepState }) {
  const base =
    "relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border bg-card";
  switch (state) {
    case "completed":
      return (
        <span className={cn(base, "border-foreground bg-foreground text-background")}>
          <Check className="size-3.5" aria-hidden />
        </span>
      );
    case "current":
      return (
        <span className={cn(base, "border-foreground")}>
          <span className="size-2 rounded-full bg-foreground" />
        </span>
      );
    case "upcoming":
      return <span className={cn(base, "border-border")} />;
    case "cancelled":
      return (
        <span className={cn(base, "border-destructive text-destructive")}>
          <span className="text-sm leading-none" aria-hidden>
            ×
          </span>
        </span>
      );
    default: {
      const unreachable: never = state;
      return unreachable;
    }
  }
}

/** Horizontal step list shared by pull-outs and transfers. Callers decide the steps. */
export function ProgressTracker({
  ariaLabel,
  items,
}: {
  ariaLabel: string;
  items: ProgressNode[];
}) {
  return (
    <ol aria-label={ariaLabel} className="flex flex-col sm:flex-row sm:items-start">
      {items.map((item, index) => {
        const last = index === items.length - 1;
        const when = item.state === "upcoming" ? null : formatWhen(item.at);
        return (
          <li
            key={item.key}
            className="relative flex flex-1 gap-3 sm:flex-col sm:items-center sm:gap-2 sm:text-center"
            aria-current={item.state === "current" ? "step" : undefined}
          >
            {index > 0 ? (
              <span
                className="absolute top-3 right-1/2 hidden h-px w-full bg-border sm:block"
                aria-hidden
              />
            ) : null}
            <div className="relative z-10 flex w-6 shrink-0 justify-center sm:w-auto">
              <StepMark state={item.state} />
              {last ? null : (
                <span
                  className="absolute top-6 bottom-0 left-1/2 w-px -translate-x-1/2 bg-border sm:hidden"
                  aria-hidden
                />
              )}
            </div>
            <div className={cn("min-w-0 sm:px-2", last ? "pb-0" : "pb-5 sm:pb-0")}>
              <span className="sr-only">{stateText(item.state)}. </span>
              {item.state === "cancelled" ? (
                <StatusCodeBadge
                  code={item.badgeCode ?? "cancelled"}
                  name={item.label}
                  color={item.color}
                />
              ) : (
                <p
                  className={cn(
                    "text-sm",
                    item.state === "upcoming" ? "text-muted-foreground" : "text-foreground",
                    item.state === "current" && "font-medium",
                  )}
                >
                  {item.label}
                </p>
              )}
              {item.state === "upcoming" ? null : (
                <p className="text-xs text-muted-foreground">{when ?? "—"}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
