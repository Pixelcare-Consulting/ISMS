import { KpiCard } from "@/lib/kpi-cards/kpi-card";
import type { KpiCardItem } from "@/lib/kpi-cards/types";
import { cn } from "@/utils/cn";

export interface GlobalKpiCardsProps {
  items: KpiCardItem[];
  className?: string;
  cardClassName?: string;
}

export function GlobalKpiCards({ items, className, cardClassName }: GlobalKpiCardsProps) {
  return (
    <div className={cn("responsive-card-grid", className)}>
      {items.map((item) => (
        <KpiCard
          key={item.key}
          label={item.label}
          value={item.value}
          className={cardClassName}
        />
      ))}
    </div>
  );
}
