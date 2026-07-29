import { TableCell } from "@/components/ui/table";
import { GlobalTableHead } from "@/lib/data-table/global-table-head";
import { cn } from "@/utils/cn";

interface TableIndexHeadProps {
  className?: string;
}

/** Standard `#` column header (`w-12`, muted, centered). Sticky via GlobalDataTable. */
export function TableIndexHead({ className }: TableIndexHeadProps) {
  return (
    <GlobalTableHead
      className={cn(
        "w-12 min-w-12 text-center text-muted-foreground",
        className,
      )}
    >
      #
    </GlobalTableHead>
  );
}

interface TableIndexCellProps {
  /** 1-based display index (pass `index + 1` from `.map`). */
  index: number;
  className?: string;
}

/** Standard `#` column cell (`tabular-nums`, muted, centered). */
export function TableIndexCell({ index, className }: TableIndexCellProps) {
  return (
    <TableCell
      className={cn("text-center tabular-nums text-muted-foreground", className)}
    >
      {index}
    </TableCell>
  );
}
