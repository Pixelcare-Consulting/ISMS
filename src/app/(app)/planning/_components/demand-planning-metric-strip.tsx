import type { ReactNode } from "react";

import { cn } from "@/utils/cn";

export type DemandPlanningMetricItem = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  emphasize?: boolean;
};

export function DemandPlanningMetricStrip({
  items,
  columns = 4,
  size = "default",
}: {
  items: DemandPlanningMetricItem[];
  columns?: 4 | 6;
  size?: "default" | "hero";
}) {
  const hero = size === "hero";

  return (
    <div
      className={cn(
        "grid gap-2 sm:grid-cols-2",
        columns === 6 ? "md:grid-cols-3 lg:grid-cols-6" : "xl:grid-cols-4",
      )}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className={cn(
            "rounded-lg border",
            hero ? "px-4 py-3.5" : "px-3 py-2.5",
            item.emphasize ? "border-primary/30 bg-primary/5" : "bg-muted/30",
          )}
        >
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {item.label}
          </p>
          <p
            className={cn(
              "mt-0.5 font-semibold tabular-nums tracking-tight",
              hero
                ? "text-2xl sm:text-3xl"
                : item.emphasize
                  ? "text-lg"
                  : "text-sm",
            )}
          >
            {item.value}
          </p>
          {item.hint ? (
            <p className={cn("mt-0.5 text-muted-foreground", hero ? "text-xs" : "text-[11px]")}>
              {item.hint}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
