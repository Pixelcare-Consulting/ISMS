"use client";

import Link from "next/link";

import type { InventoryListItem } from "@/features/inventory/actions/inventory.actions";
import { InventoryUnitStatusCell } from "@/features/inventory/components/inventory-unit-status-cell";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/utils/cn";

import { formatInventoryDrDate } from "@/app/(app)/inventory/_components/inventory-list-format";

interface InventorySerialLeafRowProps {
  row: InventoryListItem;
  hideBranch?: boolean;
  index?: number;
  className?: string;
}

export function InventorySerialLeafRow({
  row: r,
  hideBranch = false,
  index,
  className,
}: InventorySerialLeafRowProps) {
  const cellCompact = "px-3";

  return (
    <TableRow className={cn("bg-background/80", className)}>
      {index !== undefined ? (
        <TableCell className="w-12 text-center text-xs tabular-nums text-muted-foreground">
          {index}
        </TableCell>
      ) : null}
      {hideBranch ? null : (
        <TableCell
          className="min-w-0 whitespace-normal break-words px-2 text-sm"
          title={r.branch.name}
        >
          {r.branch.name}
        </TableCell>
      )}
      <TableCell className="min-w-0 px-2">
        <span className="block whitespace-normal break-words font-mono text-sm">
          {r.serialNumber.model.sku}
        </span>
        <span className="block whitespace-normal break-words text-xs text-muted-foreground">
          {r.serialNumber.model.name}
        </span>
      </TableCell>
      <TableCell className="whitespace-nowrap px-2 font-mono text-sm">
        <Link
          href={`/inventory/serial-numbers/${r.serialNumber.id}`}
          className="text-primary underline-offset-4 hover:underline"
        >
          {r.serialNumber.serialNo}
        </Link>
      </TableCell>
      <TableCell
        className={cn(
          cellCompact,
          "min-w-0 whitespace-normal break-words font-mono text-sm",
        )}
        title={r.deliveryNo?.trim() || undefined}
      >
        {r.deliveryNo?.trim() || "—"}
      </TableCell>
      <TableCell
        className={cn(cellCompact, "min-w-0 whitespace-nowrap tabular-nums text-sm")}
      >
        {formatInventoryDrDate(r.deliveryDate)}
      </TableCell>
      <TableCell className={cn(cellCompact, "min-w-0")}>
        {r.onPlanogram ? (
          <Badge
            variant="outline"
            className="whitespace-nowrap border-green-600 text-green-700"
          >
            On planogram
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="whitespace-nowrap border-amber-600 text-amber-700"
          >
            Off planogram
          </Badge>
        )}
      </TableCell>
      <TableCell className={cn(cellCompact, "text-center tabular-nums")}>
        {r.agingDays}
      </TableCell>
      <TableCell className={cn(cellCompact, "min-w-0")}>
        <InventoryUnitStatusCell row={r} />
      </TableCell>
    </TableRow>
  );
}
