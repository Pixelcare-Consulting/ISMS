"use client";

import type { BranchOrderType } from "@prisma/client";

import {
  buildApprovalTimeline,
  type ApprovalTimelineOutcome,
  type ApprovalTimelineSource,
} from "@/features/orders/lib/order-approval-timeline";
import { cn } from "@/utils/cn";

function outcomeLabel(outcome: ApprovalTimelineOutcome): string {
  switch (outcome) {
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "pending":
      return "Pending";
    default: {
      const _exhaustive: never = outcome;
      return _exhaustive;
    }
  }
}

function markerClass(outcome: ApprovalTimelineOutcome): string {
  switch (outcome) {
    case "approved":
      return "border-emerald-600 bg-emerald-600";
    case "rejected":
      return "border-destructive bg-destructive";
    case "pending":
      return "border-muted-foreground/60 bg-background";
    default: {
      const _exhaustive: never = outcome;
      return _exhaustive;
    }
  }
}

function formatWhen(value: string | Date | null): string | null {
  if (!value) return null;
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function OrderApprovalTimeline({
  orderType,
  levels,
  id,
}: {
  orderType: BranchOrderType;
  levels: readonly ApprovalTimelineSource[];
  id?: string;
}) {
  const steps = buildApprovalTimeline(orderType, levels);

  if (steps.length === 0) {
    return (
      <p id={id} className="text-sm text-muted-foreground">
        No approval steps for this order.
      </p>
    );
  }

  return (
    <ol id={id} className="space-y-0">
      {steps.map((step, index) => {
        const when = formatWhen(step.occurredAt);
        const last = index === steps.length - 1;
        return (
          <li key={step.key} className="relative pb-4 pl-6 last:pb-0">
            {last ? null : (
              <span
                aria-hidden
                className="absolute top-3.5 bottom-0 left-[6px] w-px bg-border"
              />
            )}
            <span
              aria-hidden
              className={cn(
                "absolute top-1 left-0 size-3.5 rounded-full border-2",
                markerClass(step.outcome),
              )}
            />
            <p className="text-sm font-medium break-words">{step.roleLabel}</p>
            <p className="text-xs text-muted-foreground">
              {outcomeLabel(step.outcome)}
              {step.person ? ` · ${step.person}` : ""}
              {when ? ` · ${when}` : ""}
            </p>
            {step.comment ? (
              <p className="mt-1 text-sm break-words whitespace-pre-wrap text-muted-foreground">
                {step.comment}
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
