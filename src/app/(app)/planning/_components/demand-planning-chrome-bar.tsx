"use client";

import type { DemandPlanningRunStatus } from "@prisma/client";
import { X } from "lucide-react";
import Link from "next/link";

import { cn } from "@/utils/cn";

export type DemandPlanningChromeCrumb = {
  label: string;
  href?: string;
};

function statusLabel(status: DemandPlanningRunStatus): string {
  switch (status) {
    case "draft":
      return "DRAFT";
    case "generated":
      return "GENERATED";
    case "released":
      return "RELEASED";
    case "superseded":
      return "RECALCULATED";
    default: {
      const _exhaustive: never = status;
      throw new Error(`Unhandled run status: ${_exhaustive}`);
    }
  }
}

function statusClassName(status: DemandPlanningRunStatus): string {
  switch (status) {
    case "draft":
      return "bg-amber-400 text-zinc-900";
    case "generated":
      return "bg-sky-300 text-zinc-900";
    case "released":
      return "bg-emerald-400 text-zinc-900";
    case "superseded":
      return "bg-white/20 text-white";
    default: {
      const _exhaustive: never = status;
      throw new Error(`Unhandled run status: ${_exhaustive}`);
    }
  }
}

export function DemandPlanningChromeBar({
  crumbs,
  status,
  actorName,
  onClose,
  className,
}: {
  crumbs: DemandPlanningChromeCrumb[];
  status?: DemandPlanningRunStatus;
  actorName?: string;
  onClose?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 bg-sidebar px-4 py-2.5 text-sidebar-foreground sm:px-5",
        className,
      )}
    >
      <nav aria-label="Demand Planning location" className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <span key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
              {index > 0 ? (
                <span className="text-sidebar-foreground/50" aria-hidden>
                  ›
                </span>
              ) : null}
              {crumb.href && !last ? (
                <Link
                  href={crumb.href}
                  className="truncate text-sidebar-foreground/75 hover:text-sidebar-foreground hover:underline"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className={cn("truncate", last ? "font-medium" : "text-sidebar-foreground/75")}>
                  {crumb.label}
                </span>
              )}
            </span>
          );
        })}
      </nav>
      <div className="flex shrink-0 items-center gap-2">
        {status ? (
          <span
            className={cn(
              "rounded-sm px-2 py-0.5 text-[11px] font-semibold tracking-wide",
              statusClassName(status),
            )}
          >
            {statusLabel(status)}
          </span>
        ) : null}
        {actorName ? (
          <span className="max-w-[12rem] truncate rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-white">
            {actorName}
          </span>
        ) : null}
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-white hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            <X className="size-4" strokeWidth={2.5} aria-hidden />
          </button>
        ) : null}
      </div>
    </div>
  );
}
