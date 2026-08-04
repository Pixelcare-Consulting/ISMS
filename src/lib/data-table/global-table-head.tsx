"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { useGlobalTableStickyHeader } from "@/lib/data-table/sticky-context";
import type { TableSortDirection } from "@/lib/data-table/table-sort";
import { TABLE_STICKY_HEAD_CLASSNAME } from "@/components/data-table/table-sticky";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/utils/cn";

type GlobalTableHeadProps = ComponentProps<typeof TableHead> & {
  /** When set with onSort, the header becomes a clickable Asc/Desc control. */
  sortKey?: string;
  activeSortKey?: string;
  sortDirection?: TableSortDirection;
  onSort?: (key: string) => void;
  children?: ReactNode;
};

/** Column header cell — sticky freeze + optional Asc/Desc sort on click. */
export function GlobalTableHead({
  className,
  sortKey,
  activeSortKey,
  sortDirection = "desc",
  onSort,
  children,
  ...props
}: GlobalTableHeadProps) {
  const sticky = useGlobalTableStickyHeader();
  const sortable = Boolean(sortKey && onSort);
  const isActive = sortable && activeSortKey === sortKey;

  return (
    <TableHead
      className={cn(sticky && TABLE_STICKY_HEAD_CLASSNAME, className)}
      aria-sort={
        isActive ? (sortDirection === "asc" ? "ascending" : "descending") : undefined
      }
      {...props}
    >
      {sortable ? (
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 font-medium hover:text-foreground",
            isActive ? "text-foreground" : "text-muted-foreground",
          )}
          onClick={() => onSort?.(sortKey!)}
        >
          <span>{children}</span>
          {isActive ? (
            sortDirection === "asc" ? (
              <ArrowUp className="size-3.5 shrink-0" aria-hidden />
            ) : (
              <ArrowDown className="size-3.5 shrink-0" aria-hidden />
            )
          ) : (
            <ArrowUpDown className="size-3.5 shrink-0 opacity-50" aria-hidden />
          )}
        </button>
      ) : (
        children
      )}
    </TableHead>
  );
}
