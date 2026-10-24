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

const MARK_BASE =
  "relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border bg-card";

type ProgressLinkDirection = "horizontal" | "vertical";

function linkPlacement(direction: ProgressLinkDirection): string {
  switch (direction) {
    case "horizontal":
      return "absolute top-3 right-1/2 hidden h-px w-full sm:block";
    case "vertical":
      return "absolute top-6 bottom-0 left-1/2 w-px -translate-x-1/2 sm:hidden";
    default: {
      const unreachable: never = direction;
      return unreachable;
    }
  }
}

function fillMotionClass(direction: ProgressLinkDirection): string {
  switch (direction) {
    case "horizontal":
      return "origin-left animate-progress-fill-x motion-reduce:animate-none";
    case "vertical":
      return "origin-top animate-progress-fill-y motion-reduce:animate-none";
    default: {
      const unreachable: never = direction;
      return unreachable;
    }
  }
}

/** Connector shared by every tracker. Fills from the completed side. */
export function ProgressLink({
  direction,
  filled,
  delayMs = 0,
}: {
  direction: ProgressLinkDirection;
  filled: boolean;
  delayMs?: number;
}) {
  return (
    <span className={cn(linkPlacement(direction), "overflow-hidden")} aria-hidden>
      <span className="absolute inset-0 bg-border" />
      {filled ? (
        <span
          className={cn("absolute inset-0 bg-emerald-500", fillMotionClass(direction))}
          style={{ animationDelay: `${delayMs}ms` }}
        />
      ) : null}
    </span>
  );
}

export function ProgressCompletedMark({ delayMs = 0 }: { delayMs?: number }) {
  return (
    <span className={cn(MARK_BASE, "border-emerald-600 bg-emerald-600 text-white")}>
      <Check
        className="size-3.5 origin-center animate-progress-check motion-reduce:animate-none"
        style={{ animationDelay: `${delayMs}ms` }}
        aria-hidden
      />
    </span>
  );
}

export function ProgressCurrentMark() {
  return (
    <span className={cn(MARK_BASE, "border-2 border-primary ring-4 ring-primary/20")}>
      <span className="size-2.5 animate-progress-dot rounded-full bg-primary motion-reduce:animate-none" />
    </span>
  );
}

function StepMark({ state, delayMs }: { state: ProgressStepState; delayMs: number }) {
  switch (state) {
    case "completed":
      return <ProgressCompletedMark delayMs={delayMs} />;
    case "current":
      return <ProgressCurrentMark />;
    case "upcoming":
      return <span className={cn(MARK_BASE, "border-border bg-muted/40")} />;
    case "cancelled":
      return (
        <span className={cn(MARK_BASE, "border-rose-300 bg-rose-50 text-rose-600")}>
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
        const previous = index > 0 ? items[index - 1] : null;
        const delayMs = index * 80;
        return (
          <li
            key={item.key}
            className="relative flex flex-1 gap-3 sm:flex-col sm:items-center sm:gap-2.5 sm:text-center"
            aria-current={item.state === "current" ? "step" : undefined}
          >
            {index > 0 ? (
              <ProgressLink
                direction="horizontal"
                filled={previous?.state === "completed"}
                delayMs={(index - 1) * 80}
              />
            ) : null}
            <div className="relative z-10 flex w-6 shrink-0 justify-center sm:w-auto">
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
