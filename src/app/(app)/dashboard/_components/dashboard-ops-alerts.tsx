import Link from "next/link";
import { ChevronRight } from "lucide-react";

import type { DashboardKpiKey } from "@/features/dashboard/constants/dashboard-permissions";
import type { DashboardKpis } from "@/features/dashboard/services/dashboard-kpi.service";
import { buildDashboardKpiItem } from "@/app/(app)/dashboard/_components/dashboard-ops-kpis";
import { cn } from "@/utils/cn";

interface DashboardOpsAlertsProps {
  kpis: DashboardKpis;
  keys: DashboardKpiKey[];
}

const TONE_VALUE: Record<string, string> = {
  danger: "text-destructive",
  warning: "text-amber-700 dark:text-amber-400",
  info: "text-sky-700 dark:text-sky-400",
  neutral: "text-foreground",
};

export function DashboardOpsAlerts({ kpis, keys }: DashboardOpsAlertsProps) {
  if (keys.length === 0) return null;

  const items = keys.map((key) => buildDashboardKpiItem(key, kpis));

  return (
    <div className="flex min-h-64 flex-col rounded-xl border bg-card p-4 shadow-sm">
      <div>
        <h3 className="font-semibold">Planning & alerts</h3>
        <p className="text-sm text-muted-foreground">
          More ops signals outside your top activity cards
        </p>
      </div>

      <ul className="mt-4 flex-1 divide-y rounded-lg border">
        {items.map((item) => {
          const valueClass = TONE_VALUE[item.tone ?? "neutral"] ?? TONE_VALUE.neutral;
          const content = (
            <>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-4">
                {item.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {item.label}
                </span>
                {item.hint ? (
                  <span className="block truncate text-xs text-muted-foreground">
                    {item.hint}
                  </span>
                ) : null}
              </span>
              <span
                className={cn(
                  "shrink-0 text-lg font-semibold tabular-nums",
                  valueClass,
                )}
              >
                {typeof item.value === "number"
                  ? item.value.toLocaleString()
                  : item.value}
              </span>
              {item.href ? (
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
              ) : null}
            </>
          );

          return (
            <li key={item.key}>
              {item.href ? (
                <Link
                  href={item.href}
                  className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50"
                >
                  {content}
                </Link>
              ) : (
                <div className="flex items-center gap-3 px-3 py-2.5">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
