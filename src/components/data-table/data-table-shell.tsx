import { cn } from "@/utils/cn";

interface DataTableShellProps {
  children: React.ReactNode;
  className?: string;
}

export function DataTableShell({ children, className }: DataTableShellProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border bg-card shadow-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

interface DataTableEmptyProps {
  message: string;
}

export function DataTableEmpty({ message }: DataTableEmptyProps) {
  return (
    <DataTableShell>
      <div className="py-12 text-center text-muted-foreground">{message}</div>
    </DataTableShell>
  );
}

interface DataTableScrollProps {
  children: React.ReactNode;
}

export function DataTableScroll({ children }: DataTableScrollProps) {
  return <div className="overflow-x-auto">{children}</div>;
}
