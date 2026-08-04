import type { ComponentProps } from "react";

import { TableCell } from "@/components/ui/table";
import { cn } from "@/utils/cn";
import { formatPeso } from "@/utils/format-currency";

type TableAmountCellProps = Omit<
  ComponentProps<typeof TableCell>,
  "children"
> & {
  value: number | string | null | undefined;
};

function parseAmount(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const cleaned = value.replace(/[^0-9.-]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Monospace tabular amount cell formatted as Philippine peso. */
export function TableAmountCell({
  value,
  className,
  ...props
}: TableAmountCellProps) {
  return (
    <TableCell
      className={cn("font-mono text-sm tabular-nums", className)}
      {...props}
    >
      {formatPeso(parseAmount(value))}
    </TableCell>
  );
}
