import { Check } from "lucide-react";

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

function StepMark({ state }: { state: OrderTrackerState }) {
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
      return <TerminalMark />;
    case "rejected":
      return <TerminalMark />;
    default: {
      const unreachable: never = state;
      return unreachable;
    }
  }
}

export function OrderHistoryTracker({ items }: { items: OrderTrackerNode[] }) {
  return (
    <ol aria-label="Order progress" className="flex flex-col sm:flex-row sm:items-start">
      {items.map((item, index) => {
        const last = index === items.length - 1;
        const when = item.state === "upcoming" ? null : formatOrderHistoryWhen(item.at);
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
              {item.badge ? (
                <StatusCodeBadge code={item.badge.code} name={item.badge.name} />
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
