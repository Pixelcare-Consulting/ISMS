"use client";

import {
  Ban,
  Check,
  CircleCheck,
  ClipboardCheck,
  Package,
  PackageCheck,
  PackageOpen,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { type ReactNode } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import { cn } from "@/utils/cn";

export type ProgressStepState = "completed" | "current" | "upcoming" | "cancelled";

/** One glyph per stage meaning. Stopped steps use the ban mark. */
export type ProgressStageIcon =
  | "approval"
  | "prepare"
  | "ready"
  | "pending_acceptance"
  | "transit"
  | "accepted"
  | "stopped";

const STAGE_ICONS: Record<ProgressStageIcon, LucideIcon> = {
  approval: ClipboardCheck,
  prepare: Package,
  ready: PackageCheck,
  pending_acceptance: PackageOpen,
  transit: Truck,
  accepted: CircleCheck,
  stopped: Ban,
};

type ProgressMarkSize = "rail" | "compact";

/** One audit row already stored for a stage. Missing actor or time stays empty. */
export interface ProgressStepEvent {
  id: string;
  label: string | null;
  actor: string | null;
  at: string | null;
}

export interface ProgressAuditRow {
  id?: string;
  action: string;
  at: string;
  userName?: string | null;
}

export interface ProgressNode {
  key: string;
  label: string;
  state: ProgressStepState;
  at: string | null;
  color: string | null;
  /** Badge code for a stopped step. Defaults to cancelled. */
  badgeCode?: string;
  /** Audit rows for this stage. Empty means history is unavailable. */
  events?: readonly ProgressStepEvent[];
  /** Stage glyph. Omitted screens keep a plain circle. */
  icon?: ProgressStageIcon;
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

function compareEventTime(left: string | null, right: string | null): number {
  if (left === right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left < right ? -1 : 1;
}

/** Audit rows whose action belongs to one stage, oldest first. */
export function progressEventsForActions(
  history: readonly ProgressAuditRow[],
  actions: readonly string[],
  labelFor: (action: string) => string,
): ProgressStepEvent[] {
  const allowed = new Set(actions);
  const events: ProgressStepEvent[] = [];
  for (let index = 0; index < history.length; index += 1) {
    const row = history[index];
    if (!row || !allowed.has(row.action)) continue;
    const actor = row.userName?.trim() ?? "";
    const at = row.at.trim();
    const id = row.id?.trim();
    events.push({
      id: id && id.length > 0 ? id : `${row.action}-${index}`,
      label: labelFor(row.action),
      actor: actor.length > 0 ? actor : null,
      at: at.length > 0 ? at : null,
    });
  }
  events.sort((left, right) => compareEventTime(left.at, right.at));
  return events;
}

export function progressSummaryParts(
  items: readonly ProgressNode[],
): { lead: string; detail: string | null } | null {
  const current = items.find((item) => item.state === "current");
  if (current) return { lead: "Current stage", detail: current.label };
  const stopped = items.find((item) => item.state === "cancelled");
  if (stopped) return { lead: stopped.label, detail: null };
  const completed = [...items].reverse().find((item) => item.state === "completed");
  if (completed) return { lead: "Completed", detail: completed.label };
  const upcoming = items.find((item) => item.state === "upcoming");
  if (upcoming) return { lead: "Not started", detail: upcoming.label };
  return null;
}

export function ProgressStageSummary({
  lead,
  detail,
}: {
  lead: string;
  detail?: string | null;
}) {
  return (
    <p className="mb-4 text-sm text-muted-foreground">
      <span className="font-medium text-foreground">{lead}</span>
      {detail ? (
        <>
          <span aria-hidden> · </span>
          <span>{detail}</span>
        </>
      ) : null}
    </p>
  );
}

function ProgressStageEvents({ events }: { events: readonly ProgressStepEvent[] }) {
  if (events.length === 0) {
    return <p className="mt-2 text-sm text-muted-foreground">History is unavailable.</p>;
  }

  return (
    <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
      {events.map((event) => {
        const actor = event.actor?.trim() ?? "";
        const when = formatWhen(event.at);
        const eventLabel = event.label?.trim() ?? "";
        return (
          <li key={event.id}>
            {eventLabel ? <p className="text-sm font-medium text-foreground">{eventLabel}</p> : null}
            <p className="text-sm text-muted-foreground">{actor || "Person unavailable"}</p>
            <p className="text-xs text-muted-foreground">{when ?? "Time unavailable"}</p>
          </li>
        );
      })}
    </ul>
  );
}

const STAGE_BUTTON =
  "group relative z-10 flex min-w-0 w-full flex-1 cursor-pointer appearance-none gap-3 rounded-md border-0 bg-transparent p-0 text-left font-inherit text-inherit shadow-none outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-col sm:items-center sm:gap-2.5 sm:text-center";

export function ProgressStagePopover({
  label,
  events,
  className,
  children,
}: {
  label: string;
  events: readonly ProgressStepEvent[];
  className?: string;
  children: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={cn(STAGE_BUTTON, className)}>
          {children}
          <span className="sr-only"> Show history.</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-72 max-w-[calc(100vw-2rem)] p-3">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <ProgressStageEvents events={events} />
      </PopoverContent>
    </Popover>
  );
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

function markBox(size: ProgressMarkSize): string {
  switch (size) {
    case "rail":
      return "size-6";
    case "compact":
      return "size-5";
    default: {
      const unreachable: never = size;
      return unreachable;
    }
  }
}

function markGlyph(size: ProgressMarkSize): string {
  switch (size) {
    case "rail":
      return "size-3.5";
    case "compact":
      return "size-3";
    default: {
      const unreachable: never = size;
      return unreachable;
    }
  }
}

function currentRing(size: ProgressMarkSize): string {
  switch (size) {
    case "compact":
      return "ring-2 ring-primary/25";
    case "rail":
      return "ring-4 ring-primary/20";
    default: {
      const unreachable: never = size;
      return unreachable;
    }
  }
}

/** Stage icon in the completed, current, upcoming, or stopped treatment. */
export function ProgressStageMark({
  icon,
  state,
  delayMs = 0,
  size = "rail",
}: {
  icon: ProgressStageIcon;
  state: ProgressStepState;
  delayMs?: number;
  size?: ProgressMarkSize;
}) {
  const Icon = STAGE_ICONS[icon];
  const box = cn(
    "relative z-10 flex shrink-0 items-center justify-center rounded-full",
    markBox(size),
  );
  const glyph = markGlyph(size);
  switch (state) {
    case "completed":
      return (
        <span className={cn(box, "border-2 border-emerald-600 bg-emerald-600 text-white")}>
          <Icon
            className={cn(
              glyph,
              size === "rail" && "origin-center animate-progress-check motion-reduce:animate-none",
            )}
            style={size === "rail" ? { animationDelay: `${delayMs}ms` } : undefined}
            aria-hidden
          />
        </span>
      );
    case "current":
      return (
        <span className={cn(box, "border-2 border-primary bg-card text-primary", currentRing(size))}>
          <Icon className={glyph} aria-hidden />
        </span>
      );
    case "upcoming":
      return (
        <span className={cn(box, "border border-border bg-muted/40 text-muted-foreground")}>
          <Icon className={glyph} aria-hidden />
        </span>
      );
    case "cancelled":
      return (
        <span className={cn(box, "border border-rose-300 bg-rose-50 text-rose-600")}>
          <Icon className={glyph} aria-hidden />
        </span>
      );
    default: {
      const unreachable: never = state;
      return unreachable;
    }
  }
}

function StepMark({
  state,
  icon,
  delayMs,
}: {
  state: ProgressStepState;
  icon?: ProgressStageIcon;
  delayMs: number;
}) {
  if (icon) return <ProgressStageMark icon={icon} state={state} delayMs={delayMs} />;
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

function stageTimeText(item: ProgressNode): string | null {
  if (item.state === "upcoming") return null;
  return formatWhen(item.at) ?? "Time unavailable";
}

function StageTime({ at, text }: { at: string | null; text: string }) {
  if (!at || text === "Time unavailable") return <span>{text}</span>;
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return <span>{text}</span>;
  return <time dateTime={at}>{text}</time>;
}

/** Horizontal step list shared by pull-outs and transfers. Callers decide the steps. */
export function ProgressTracker({
  ariaLabel,
  items,
}: {
  ariaLabel: string;
  items: ProgressNode[];
}) {
  const summary = progressSummaryParts(items);

  return (
    <div>
      {summary ? <ProgressStageSummary lead={summary.lead} detail={summary.detail} /> : null}
      <ol aria-label={ariaLabel} className="flex flex-col sm:flex-row sm:items-start">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          const previous = index > 0 ? items[index - 1] : null;
          const delayMs = index * 80;
          const timeText = stageTimeText(item);
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
              <ProgressStagePopover label={item.label} events={item.events ?? []}>
                <div className="relative flex w-6 shrink-0 justify-center sm:w-auto">
                  <StepMark state={item.state} icon={item.icon} delayMs={delayMs} />
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
                  {item.state === "cancelled" || item.state === "current" ? (
                    <StatusCodeBadge
                      code={item.badgeCode ?? item.key}
                      name={item.label}
                      color={item.color}
                    />
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
                  {timeText ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      <StageTime at={item.at} text={timeText} />
                    </p>
                  ) : null}
                </div>
              </ProgressStagePopover>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
