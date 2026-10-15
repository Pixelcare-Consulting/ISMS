import { KpiCard } from "@/lib/kpi-cards/kpi-card";
import type { KpiCardItem } from "@/lib/kpi-cards/types";
import { cn } from "@/utils/cn";

export interface GlobalKpiCardsProps {
  items: KpiCardItem[];
  className?: string;
  cardClassName?: string;
  /** Replaces the default grid (for example a compact grid inside a module guide). */
  gridClassName?: string;
}

export function GlobalKpiCards({
  items,
  className,
  cardClassName,
  gridClassName = "responsive-card-grid",
}: GlobalKpiCardsProps) {
  return (
    <div className={cn(gridClassName, className)}>
      {items.map((item) => (
        <KpiCard
          key={item.key}
          label={item.label}
          value={item.value}
          href={item.href}
          icon={item.icon}
          tone={item.tone}
          hint={item.hint}
          className={cn("h-full", cardClassName)}
        />
      ))}
    </div>
  );
}
