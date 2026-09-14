import type { ReactNode } from "react";

import { DataTableShell } from "@/components/data-table/data-table-shell";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/utils/cn";

export interface OrderSummaryRow {
  label: string;
  value: ReactNode;
}

interface OrderSummaryTableProps {
  rows: OrderSummaryRow[];
  className?: string;
}

export function OrderSummaryTable({ rows, className }: OrderSummaryTableProps) {
  return (
    <DataTableShell className={cn("w-full max-w-sm", className)}>
      <Table scrollContainer={false}>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.label} className="even:bg-muted/50 hover:bg-transparent">
              <TableCell className="px-3 py-2 font-medium tracking-wide text-muted-foreground uppercase">
                {row.label}
              </TableCell>
              <TableCell className="px-3 py-2 text-right font-semibold tabular-nums">
                <div className="flex justify-end">{row.value}</div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </DataTableShell>
  );
}
