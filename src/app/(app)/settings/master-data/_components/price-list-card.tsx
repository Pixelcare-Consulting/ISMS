"use client";

import { Badge } from "@/components/ui/badge";
import { formatPeso } from "@/utils/format-currency";
import { cn } from "@/utils/cn";
import type { ClientPriceListRow } from "@/features/master-data/types/client-price-list";

export type PriceListCardRow = ClientPriceListRow;

export interface PriceListModelGroup {
  modelId: string;
  skuCode: string;
  name: string;
  latest: PriceListCardRow;
  periodCount: number;
}

interface PriceListCardProps {
  group: PriceListModelGroup;
  onOpen: () => void;
}

export function PriceListCard({ group, onOpen }: PriceListCardProps) {
  const { latest, periodCount } = group;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group flex w-full flex-col rounded-xl border border-border/70 bg-card p-4 text-left shadow-sm transition-colors",
        "hover:border-border hover:bg-accent/20",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <div className="flex flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-mono text-base font-semibold tracking-tight text-foreground">
            {group.skuCode}
          </h2>
          <Badge
            variant="secondary"
            className="h-5 rounded-md px-1.5 text-[10px] font-medium"
          >
            {periodCount === 1 ? "1 period" : `${periodCount} periods`}
          </Badge>
          {latest.packageType ? (
            <Badge
              variant="outline"
              className="h-5 rounded-md px-1.5 text-[10px] font-medium"
            >
              {latest.packageType.name}
            </Badge>
          ) : null}
        </div>
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {group.name}
        </p>
        <p className="pt-1 text-lg font-semibold tabular-nums text-foreground">
          {formatPeso(latest.amount)}
        </p>
        <p className="text-xs tabular-nums text-muted-foreground">
          Latest: {latest.periodStart} → {latest.periodEnd}
        </p>
      </div>
    </button>
  );
}
