"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

interface TableSelectionBadgeProps {
  count: number;
  onClear: () => void;
  /** Optional bulk-action buttons shown beside the clear control. */
  actions?: ReactNode;
  /** Noun after the count, e.g. "selected" → "3 selected". */
  label?: string;
  className?: string;
  size?: "default" | "sm";
}

/**
 * Toolbar chip: “N selected” that clears selection on click.
 * Renders nothing when `count` is 0.
 */
export function TableSelectionBadge({
  count,
  onClear,
  actions,
  label = "selected",
  className,
  size = "default",
}: TableSelectionBadgeProps) {
  if (count <= 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Button
        type="button"
        variant="secondary"
        size={size}
        onClick={onClear}
        title="Clear selection"
      >
        {count} {label}
      </Button>
      {actions}
    </div>
  );
}
