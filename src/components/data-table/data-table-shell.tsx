import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/utils/cn";

interface DataTableShellProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function DataTableShell({ children, className, style }: DataTableShellProps) {
  return (
    <div
      style={style}
      className={cn(
        "overflow-hidden rounded-xl border bg-card shadow-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

interface DataTableEmptyContentProps {
  message: string;
  className?: string;
}

/** Inner empty copy — use inside an existing card/shell (e.g. AppDataTable). */
export function DataTableEmptyContent({
  message,
  className,
}: DataTableEmptyContentProps) {
  return (
    <div className={cn("py-12 text-center text-muted-foreground", className)}>
      {message}
    </div>
  );
}

interface DataTableEmptyStateProps {
  message: string;
  className?: string;
}

/** Standalone card empty — whole page empty, no table yet. */
export function DataTableEmptyState({
  message,
  className,
}: DataTableEmptyStateProps) {
  return (
    <DataTableShell className={className}>
      <DataTableEmptyContent message={message} />
    </DataTableShell>
  );
}

/** @deprecated Prefer `DataTableEmptyState` — alias kept for existing imports. */
export const DataTableEmpty = DataTableEmptyState;

interface TableEmptyRowProps {
  colSpan: number;
  message: string;
  className?: string;
}

/** Filtered / no-results row inside an existing `<TableBody>`. */
export function TableEmptyRow({
  colSpan,
  message,
  className,
}: TableEmptyRowProps) {
  return (
    <TableRow>
      <TableCell
        colSpan={colSpan}
        className={cn("h-24 text-center text-muted-foreground", className)}
      >
        {message}
      </TableCell>
    </TableRow>
  );
}

interface DataTableScrollProps {
  children: React.ReactNode;
}

export function DataTableScroll({ children }: DataTableScrollProps) {
  return <div className="overflow-x-auto">{children}</div>;
}
