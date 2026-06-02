import type { ReactNode } from "react";

import {
  DataTableScroll,
  DataTableShell,
} from "@/components/data-table/data-table-shell";
import { cn } from "@/utils/cn";

export interface AppDataTableProps {
  /** Section heading above the card */
  title?: string;
  /** Badge or label beside the title */
  leading?: ReactNode;
  /** Right-aligned actions beside the title row */
  actions?: ReactNode;
  /** Toolbar inside the card (filters, search) */
  shellHeader?: ReactNode;
  empty?: boolean;
  emptyMessage?: string;
  children?: ReactNode;
  className?: string;
}

/**
 * Standard app table: titled section + card shell + scrollable table body.
 * Pass a shadcn `<Table>` as children. Use `shellHeader` for filters inside the card.
 */
export function AppDataTable({
  title,
  leading,
  actions,
  shellHeader,
  empty = false,
  emptyMessage = "No data.",
  children,
  className,
}: AppDataTableProps) {
  const showTitleRow = Boolean(title || leading || actions);

  return (
    <section className={cn("space-y-2", className)}>
      {showTitleRow ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {title ? <h2 className="text-sm font-medium">{title}</h2> : null}
            {leading}
          </div>
          {actions}
        </div>
      ) : null}

      <DataTableShell>
        {shellHeader ? (
          <div className="border-b px-4 py-3">{shellHeader}</div>
        ) : null}
        {empty ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          children
        )}
      </DataTableShell>
    </section>
  );
}

/** Wraps table markup for horizontal scroll inside AppDataTable. */
export function AppDataTableBody({ children }: { children: ReactNode }) {
  return <DataTableScroll>{children}</DataTableScroll>;
}
