import type { ComponentProps } from "react";

import { TableCell } from "@/components/ui/table";
import { cn } from "@/utils/cn";

type TableCodeCellProps = ComponentProps<typeof TableCell> & {
  /** When null/undefined/empty string, renders an em dash. */
  value?: string | null;
};

/** Monospace code cell for serials, transaction numbers, SKUs, etc. */
export function TableCodeCell({
  value,
  children,
  className,
  ...props
}: TableCodeCellProps) {
  const content =
    children ??
    (value == null || value === "" ? "—" : value);

  return (
    <TableCell className={cn("font-mono text-sm", className)} {...props}>
      {content}
    </TableCell>
  );
}
