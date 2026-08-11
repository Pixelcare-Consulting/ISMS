import { DataTableShell } from "@/components/data-table/data-table-shell";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/utils/cn";

interface DataTableSkeletonProps {
  /** Column header labels to mirror the real table. */
  columns: string[];
  /** Placeholder rows while data loads. */
  rowCount?: number;
  className?: string;
  /** Accessible label for the loading region. */
  label?: string;
}

/**
 * Card + toolbar + header/row placeholders matching GlobalDataTable layout.
 * Use while a table is fetching (e.g. Sales ↔ Returns tab navigation).
 */
export function DataTableSkeleton({
  columns,
  rowCount = 8,
  className,
  label = "Loading table",
}: DataTableSkeletonProps) {
  return (
    <div className={cn("space-y-4", className)} aria-busy="true" aria-label={label}>
      <DataTableShell>
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5 sm:px-4">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 min-w-48 flex-1" />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead key={column} className="whitespace-nowrap">
                    {column}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: rowCount }, (_, rowIndex) => (
                <TableRow
                  key={rowIndex}
                  className={rowIndex % 2 === 1 ? "bg-table-stripe" : undefined}
                >
                  {columns.map((column, colIndex) => (
                    <TableCell key={`${rowIndex}-${column}`} className="py-2 sm:py-2.5">
                      <Skeleton
                        className={cn(
                          "h-4",
                          colIndex === 0
                            ? "w-8"
                            : colIndex === columns.length - 1
                              ? "w-24"
                              : "w-20 sm:w-28",
                        )}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between gap-3 border-t px-3 py-2.5 sm:px-4">
          <Skeleton className="h-4 w-32" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
          </div>
        </div>
      </DataTableShell>
    </div>
  );
}
