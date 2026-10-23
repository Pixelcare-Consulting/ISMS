import {
  ProgressCompletedMark,
  ProgressCurrentMark,
  ProgressLink,
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

export function OrderHistoryTracker({ items }: { items: OrderTrackerNode[] }) {
  return (
    <ol aria-label="Order progress" className="flex flex-col sm:flex-row sm:items-start">
      {items.map((item, index) => {
        const last = index === items.length - 1;
        const when = item.state === "upcoming" ? null : formatOrderHistoryWhen(item.at);
        const previous = index > 0 ? items[index - 1] : null;
        const delayMs = index * 80;
        return (
          <li
            key={item.key}
            className="relative flex flex-1 gap-3 sm:flex-col sm:items-center sm:gap-2 sm:text-center"
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
