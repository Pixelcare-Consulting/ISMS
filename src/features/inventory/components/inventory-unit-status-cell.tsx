"use client";

import type { InventoryListItem } from "@/features/inventory/actions/inventory.actions";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import { cn } from "@/utils/cn";

interface InventoryUnitStatusCellProps {
  row: InventoryListItem;
  disabled?: boolean;
  className?: string;
}

export function InventoryUnitStatusCell({
  row,
  disabled = false,
  className,
}: InventoryUnitStatusCellProps) {
  return (
    <div className={cn("min-w-0", className, disabled && "opacity-70")}>
      <StatusCodeBadge
        code={row.statusCode.code}
        name={row.statusCode.name}
        color={row.statusCode.color}
        showCode
      />
    </div>
  );
}
