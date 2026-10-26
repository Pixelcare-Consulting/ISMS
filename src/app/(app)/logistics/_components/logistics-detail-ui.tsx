"use client";

import { Check, History, Route } from "lucide-react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import {
  resolveStatusColorKey,
  type StatusColorKey,
} from "@/features/reason-status/constants/status-colors";
import { cn } from "@/utils/cn";

const ACTIVITY_TIME = new Intl.DateTimeFormat("en-PH", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Manila",
});

function formatActivityTime(value: string): { text: string; dateTime: string | null } {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { text: "Time unavailable", dateTime: null };
  return { text: ACTIVITY_TIME.format(date), dateTime: value };
}

/** Soft wash for the document header. In transit (sky) is a plain white card. */
function documentSurfaceClass(key: StatusColorKey): string {
  switch (key) {
    case "emerald":
      return "border-emerald-200 border-l-emerald-500 bg-emerald-50";
    case "amber":
      return "border-amber-200 border-l-amber-500 bg-amber-50";
    case "sky":
      return "bg-card";
    case "rose":
      return "border-rose-200 border-l-rose-500 bg-rose-50";
    case "violet":
      return "border-violet-200 border-l-violet-500 bg-violet-50";
    case "orange":
      return "border-orange-200 border-l-orange-500 bg-orange-50";
    case "teal":
      return "border-teal-200 border-l-teal-500 bg-teal-50";
    case "slate":
      return "border-slate-200 border-l-slate-400 bg-slate-50";
    default: {
      const unreachable: never = key;
      return unreachable;
    }
  }
}

export type LogisticsSectionTone = "sky" | "violet" | "amber" | "slate";

function sectionToneClasses(tone: LogisticsSectionTone): { header: string; chip: string } {
  switch (tone) {
    case "sky":
      return { header: "bg-sky-50", chip: "bg-sky-100 text-sky-700" };
    case "violet":
      return { header: "bg-violet-50", chip: "bg-violet-100 text-violet-700" };
    case "amber":
      return { header: "bg-amber-50", chip: "bg-amber-100 text-amber-800" };
    case "slate":
      return { header: "bg-slate-50", chip: "bg-slate-100 text-slate-600" };
    default: {
      const unreachable: never = tone;
      return unreachable;
    }
  }
}

export function LogisticsDocumentHeader({
  backHref,
  backLabel,
  context,
  title,
  statusCode,
  statusColor,
  badges,
  actions,
  plain = false,
}: {
  backHref: string;
  backLabel: string;
  context: string;
  title: string;
  statusCode: string;
  statusColor?: string | null;
  badges: ReactNode;
  actions?: ReactNode;
  /** White card. No status wash and no colored left edge. */
  plain?: boolean;
}) {
  const colorKey = resolveStatusColorKey(statusColor, statusCode);
  const plainSurface = plain || colorKey === "sky";
  const surface = plainSurface ? "bg-card" : documentSurfaceClass(colorKey);

  return (
    <div className="space-y-2">
      <Link
        href={backHref}
        className="inline-flex text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
      >
        {backLabel}
      </Link>
      <header
        className={cn(
          "flex flex-col gap-4 rounded-xl border p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5",
          plainSurface ? null : "border-l-4",
          surface,
        )}
      >
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {context}
          </p>
          <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">{badges}</div>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
        ) : null}
      </header>
    </div>
  );
}

export function LogisticsProgressCard({ children }: { children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-center gap-2.5 border-b bg-primary/5 px-4 py-3 sm:px-5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Route className="size-4" aria-hidden />
        </span>
        <h2 className="font-medium text-foreground">Progress</h2>
      </div>
      <div className="bg-card p-4 sm:p-5">{children}</div>
    </section>
  );
}

function doneLineDetail(detail: ReactNode): ReactNode | null {
  if (typeof detail === "string") {
    const trimmed = detail.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return detail ?? null;
}

/** One finished step: a check, the job name, and an optional person and time. */
export function LogisticsDoneLine({
  title,
  detail,
}: {
  title: string;
  detail?: ReactNode;
}) {
  const shown = doneLineDetail(detail);

  return (
    <p className="flex min-w-0 flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
      <Check className="size-3.5 shrink-0 text-emerald-600" aria-hidden />
      <span>{title}</span>
      {shown ? (
        <span className="min-w-0">
          <span aria-hidden> · </span>
          {shown}
        </span>
      ) : null}
    </p>
  );
}

/** Current job. White card: one sentence, this step’s fields, and its action. */
export function LogisticsStepWorkspace({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="border-b bg-card px-4 py-3 sm:px-5">
        <h2 className="font-medium text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="bg-card p-4 sm:p-5">{children}</div>
      {actions ? (
        <footer className="flex flex-wrap items-center justify-end gap-2 border-t bg-card px-4 py-3 sm:px-5">
          {actions}
        </footer>
      ) : null}
    </section>
  );
}

export function LogisticsInfoCard({
  title,
  icon: Icon,
  tone,
  children,
  className,
}: {
  title: string;
  icon?: LucideIcon;
  tone: LogisticsSectionTone;
  children: ReactNode;
  className?: string;
}) {
  const toneClasses = sectionToneClasses(tone);

  return (
    <section className={cn("overflow-hidden rounded-xl border bg-card shadow-sm", className)}>
      <div
        className={cn(
          "flex items-center gap-2.5 border-b px-4 py-3 sm:px-5",
          toneClasses.header,
        )}
      >
        {Icon ? (
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg",
              toneClasses.chip,
            )}
          >
            <Icon className="size-4" aria-hidden />
          </span>
        ) : null}
        <h2 className="font-medium text-foreground">{title}</h2>
      </div>
      <div className="bg-card p-4 sm:p-5">{children}</div>
    </section>
  );
}

export function LogisticsTableHeading({
  title,
  count,
  itemLabel,
}: {
  title: string;
  count: number;
  itemLabel: string;
}) {
  return (
    <div className="min-w-0">
      <p className="font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">
        {count} {itemLabel}
        {count === 1 ? "" : "s"}
      </p>
    </div>
  );
}

export interface LogisticsActivity {
  id: string;
  label: string;
  actor?: string | null;
  at: string;
}

export interface LogisticsTimelineItem {
  id: string;
  title: string;
  subtitle?: ReactNode;
  note?: string | null;
  pending?: boolean;
}

function activityTime(value: string): number {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

interface GroupedActivity {
  id: string;
  label: string;
  actor?: string | null;
  at: string;
  count: number;
}

/** Display grouping only. Stored history rows are left as they were saved. */
function groupActivities(items: LogisticsActivity[]): GroupedActivity[] {
  const groups: GroupedActivity[] = [];
  const indexByLabel = new Map<string, number>();

  for (const item of items) {
    const index = indexByLabel.get(item.label);
    if (index === undefined) {
      indexByLabel.set(item.label, groups.length);
      groups.push({
        id: item.id,
        label: item.label,
        actor: item.actor,
        at: item.at,
        count: 1,
      });
      continue;
    }

    const group = groups[index];
    if (!group) continue;
    group.count += 1;
    if (activityTime(item.at) >= activityTime(group.at)) {
      group.actor = item.actor;
      group.at = item.at;
    }
  }

  return groups;
}

export function LogisticsTimeline({ items }: { items: LogisticsTimelineItem[] }) {
  return (
    <ol className="divide-y">
      {items.map((item) => (
        <li key={item.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
          <div className="pt-1.5">
            {item.pending ? (
              <span
                className="block size-2.5 rounded-full border-2 border-muted-foreground/40 bg-card ring-4 ring-transparent"
                aria-hidden
              />
            ) : (
              <span
                className="block size-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-100"
                aria-hidden
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{item.title}</p>
            {item.pending ? (
              <p className="mt-0.5 text-xs text-muted-foreground">Pending</p>
            ) : item.subtitle ? (
              <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                {item.subtitle}
              </div>
            ) : null}
            {item.note?.trim() ? (
              <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">{item.note.trim()}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function ActivityStamp({ at }: { at: string }) {
  const stamp = formatActivityTime(at);
  if (!stamp.dateTime) return <span>{stamp.text}</span>;
  return <time dateTime={stamp.dateTime}>{stamp.text}</time>;
}

export function LogisticsHistoryCard({
  items,
  groupByLabel = true,
}: {
  items: LogisticsActivity[];
  /** Repeated labels stay separate when this is off, so they are not counted as units. */
  groupByLabel?: boolean;
}) {
  const grouped = groupByLabel
    ? groupActivities(items)
    : items.map((item) => ({
        id: item.id,
        label: item.label,
        actor: item.actor,
        at: item.at,
        count: 1,
      }));

  return (
    <LogisticsInfoCard title="History" icon={History} tone="slate">
      {grouped.length === 0 ? (
        <p className="text-sm text-muted-foreground">No history yet.</p>
      ) : (
        <LogisticsTimeline
          items={grouped.map((item) => ({
            id: item.id,
            title: item.label,
            subtitle: (
              <>
                {item.actor ? <span>{item.actor}</span> : null}
                <ActivityStamp at={item.at} />
                {item.count > 1 ? <span>{item.count} units</span> : null}
              </>
            ),
          }))}
        />
      )}
    </LogisticsInfoCard>
  );
}
