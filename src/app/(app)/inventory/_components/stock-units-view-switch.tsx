"use client";

import Link from "next/link";

import { STOCK_UNITS_VIEW_OPTIONS } from "@/features/inventory/constants/stock-units-view";
import type { StockUnitsView } from "@/features/inventory/constants/stock-units-view";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

interface StockUnitsViewSwitchProps {
  current: StockUnitsView;
  hrefForView: (view: StockUnitsView) => string;
}

export function StockUnitsViewSwitch({
  current,
  hrefForView,
}: StockUnitsViewSwitchProps) {
  return (
    <div
      className="inline-flex rounded-lg border border-border/80 bg-muted/50 p-0.5"
      role="group"
      aria-label="Stock units view"
    >
      {STOCK_UNITS_VIEW_OPTIONS.map((option) => {
        const active = current === option.id;
        return (
          <Button
            key={option.id}
            variant={active ? "secondary" : "ghost"}
            size="sm"
            className={cn(
              "h-8 rounded-md px-3 text-xs sm:text-sm",
              !active && "text-muted-foreground",
            )}
            asChild
          >
            <Link href={hrefForView(option.id)}>{option.label}</Link>
          </Button>
        );
      })}
    </div>
  );
}
