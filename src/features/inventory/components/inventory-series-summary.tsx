import type { InventorySeriesSummary } from "@/features/inventory/services/inventory.service";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPeso } from "@/utils/format-currency";

interface InventorySeriesSummaryProps {
  summary: InventorySeriesSummary;
}

export function InventorySeriesSummaryPanel({ summary }: InventorySeriesSummaryProps) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold tracking-wide">Series summary</h2>
        <p className="text-xs text-muted-foreground">
          QTY and peso value by SKU series (trailing digits stripped). Follows applied filters.
        </p>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SERIES</TableHead>
              <TableHead className="text-right">QTY</TableHead>
              <TableHead className="text-right">VALUE</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
                  No stock units match the current filters
                </TableCell>
              </TableRow>
            ) : (
              summary.rows.map((row) => (
                <TableRow key={row.series}>
                  <TableCell className="font-mono text-sm">{row.series}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.qty}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPeso(row.value)}
                  </TableCell>
                </TableRow>
              ))
            )}
            {summary.rows.length > 0 ? (
              <TableRow className="bg-muted/40 font-semibold hover:bg-muted/40">
                <TableCell>TOTAL</TableCell>
                <TableCell className="text-right tabular-nums">{summary.totalQty}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatPeso(summary.totalValue)}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
