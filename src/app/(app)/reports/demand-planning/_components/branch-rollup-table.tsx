"use client";

import type { DemandPlanningPlanStatus } from "@prisma/client";

import {
  DataTableScroll,
  DataTableShell,
  TableAmountCell,
  TableEmptyRow,
  TableStatusBadge,
} from "@/components/data-table";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CoverageBranchRow } from "@/features/demand-planning/services/coverage.service";
import { formatPeso } from "@/utils/format-currency";

interface BranchRollupTableProps {
  branches: CoverageBranchRow[];
}

function planStatusLabel(status: DemandPlanningPlanStatus): string {
  switch (status) {
    case "planned":
      return "Planned";
    case "no_history":
      return "NO HISTORY";
    case "awaiting":
      return "Awaiting";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function formatDays(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  return `${value.toFixed(1)} d`;
}

export function BranchRollupTable({ branches }: BranchRollupTableProps) {
  const planned = branches.filter((row) => row.planStatus === "planned");
  const totals = planned.reduce(
    (sum, row) => {
      sum.quotaPeso += row.quotaPeso;
      sum.historyPeso += row.historyPeso;
      sum.milPeso += row.milPeso;
      sum.allocPeso += row.allocPeso;
      sum.drop1Peso += row.drop1Peso;
      sum.totalInventoryPeso += row.totalInventoryPeso;
      return sum;
    },
    {
      quotaPeso: 0,
      historyPeso: 0,
      milPeso: 0,
      allocPeso: 0,
      drop1Peso: 0,
      totalInventoryPeso: 0,
    },
  );

  return (
    <DataTableShell>
      <div className="border-b px-4 py-3">
        <h3 className="font-semibold">Branch roll-up</h3>
        <p className="text-sm text-muted-foreground">
          Every branch in the run, including NO HISTORY.
        </p>
      </div>
      <DataTableScroll>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Branch</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Quota</TableHead>
              <TableHead className="text-right">History</TableHead>
              <TableHead className="text-right">MIL</TableHead>
              <TableHead className="text-right">Allocation</TableHead>
              <TableHead className="text-right">Alloc / target</TableHead>
              <TableHead className="text-right">Drop 1</TableHead>
              <TableHead className="text-right">Total inventory</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {branches.length === 0 ? (
              <TableEmptyRow colSpan={9} message="This plan has no branch rows yet." />
            ) : (
              branches.map((row) => (
                <TableRow key={row.branchId}>
                  <TableCell>
                    <div className="min-w-0">
                      <p className="font-medium">{row.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{row.sapCode}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <TableStatusBadge
                      status={row.planStatus}
                      activeValue="planned"
                      label={planStatusLabel(row.planStatus)}
                      variantMap={{
                        planned: "default",
                        no_history: "destructive",
                        awaiting: "outline",
                      }}
                    />
                  </TableCell>
                  <TableAmountCell value={row.quotaPeso} className="text-right" />
                  <TableAmountCell value={row.historyPeso} className="text-right" />
                  <TableAmountCell value={row.milPeso} className="text-right" />
                  <TableAmountCell value={row.allocPeso} className="text-right" />
                  <TableCell className="text-right tabular-nums text-sm">
                    {formatDays(row.allocationDays)} / {formatDays(row.targetDays)}
                  </TableCell>
                  <TableAmountCell value={row.drop1Peso} className="text-right" />
                  <TableAmountCell value={row.totalInventoryPeso} className="text-right" />
                </TableRow>
              ))
            )}
          </TableBody>
          {planned.length > 0 ? (
            <TableFooter>
              <TableRow className="hover:bg-transparent">
                <TableCell className="font-semibold">Planned total</TableCell>
                <TableCell />
                <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">
                  {formatPeso(totals.quotaPeso)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">
                  {formatPeso(totals.historyPeso)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">
                  {formatPeso(totals.milPeso)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">
                  {formatPeso(totals.allocPeso)}
                </TableCell>
                <TableCell />
                <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">
                  {formatPeso(totals.drop1Peso)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">
                  {formatPeso(totals.totalInventoryPeso)}
                </TableCell>
              </TableRow>
            </TableFooter>
          ) : null}
        </Table>
      </DataTableScroll>
    </DataTableShell>
  );
}
