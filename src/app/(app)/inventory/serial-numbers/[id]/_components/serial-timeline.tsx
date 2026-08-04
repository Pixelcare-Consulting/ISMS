import {
  ArrowLeftRight,
  ArrowUpToLine,
  ClipboardList,
  Package,
  RotateCcw,
  Store,
  type LucideIcon,
} from "lucide-react";

import type {
  SerialEventType,
  SerialTimelineEvent,
  SerialTraceability,
} from "@/features/serial-numbers/services/serial-number.service";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/utils/cn";

const EVENT_META: Record<
  SerialEventType,
  { icon: LucideIcon; tint: string }
> = {
  inventory: { icon: Package, tint: "bg-sky-100 text-sky-700" },
  sale: { icon: Store, tint: "bg-emerald-100 text-emerald-700" },
  return: { icon: RotateCcw, tint: "bg-rose-100 text-rose-700" },
  transfer: { icon: ArrowLeftRight, tint: "bg-violet-100 text-violet-700" },
  pullout: { icon: ArrowUpToLine, tint: "bg-amber-100 text-amber-700" },
  count: { icon: ClipboardList, tint: "bg-slate-100 text-slate-700" },
};

const dateFormatter = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
});

interface SerialTimelineProps {
  serial: SerialTraceability;
}

export function SerialTimeline({ serial }: SerialTimelineProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="font-mono text-lg">{serial.serialNo}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {serial.model.skuCode} — {serial.model.name}
              {serial.model.brand ? ` · ${serial.model.brand}` : ""}
            </p>
          </div>
          <Badge
            variant={serial.recordStatus === "active" ? "default" : "secondary"}
          >
            {serial.recordStatus === "active" ? "Active" : "Inactive"}
          </Badge>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Current branch
              </dt>
              <dd className="text-sm font-medium">
                {serial.current?.branch ?? "—"}
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Current status
              </dt>
              <dd className="text-sm">
                {serial.current?.status ? (
                  <StatusCodeBadge
                    code={serial.current.status.code}
                    name={serial.current.status.name}
                    color={serial.current.status.color}
                  />
                ) : (
                  "—"
                )}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lifecycle timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {serial.events.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No lifecycle activity recorded for this serial yet.
            </p>
          ) : (
            <ol className="space-y-6">
              {serial.events.map((event, index) => (
                <TimelineRow
                  key={event.id}
                  event={event}
                  last={index === serial.events.length - 1}
                />
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TimelineRow({
  event,
  last,
}: {
  event: SerialTimelineEvent;
  last: boolean;
}) {
  const meta = EVENT_META[event.type];
  const Icon = meta.icon;

  return (
    <li className="relative flex gap-4">
      {!last ? (
        <span
          className="absolute left-4 top-9 -bottom-6 w-px -translate-x-1/2 bg-border"
          aria-hidden
        />
      ) : null}
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          meta.tint,
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-1 pt-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium">{event.label}</span>
          {event.branch ? (
            <span className="text-sm text-muted-foreground">
              @ {event.branch}
            </span>
          ) : null}
          {event.status ? (
            <StatusCodeBadge
              code={event.status.code}
              name={event.status.name}
              color={event.status.color}
            />
          ) : null}
        </div>
        {event.detail ? (
          <p className="text-sm text-muted-foreground">{event.detail}</p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {dateFormatter.format(event.at)}
        </p>
      </div>
    </li>
  );
}
