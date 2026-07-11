import { TableCell, TableHead } from "@/components/ui/table";
import { cn } from "@/utils/cn";

interface TableIndexHeadProps {
  className?: string;
}

/** Standard `#` column header (`w-12`, muted, centered). */
export function TableIndexHead({ className }: TableIndexHeadProps) {
  return (
    <TableHead
      className={cn(
        "w-12 min-w-12 text-center text-muted-foreground",
        className,
      )}
    >
      #
    </TableHead>
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
