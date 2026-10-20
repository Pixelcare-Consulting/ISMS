"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { useMemo } from "react";
import type { DemandPlanningPlanStatus } from "@prisma/client";

import { TableStatusBadge } from "@/components/data-table";
import type { CoverageBranchRow } from "@/features/demand-planning/services/coverage.service";
import {
  DataTable,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
import { formatPeso } from "@/utils/format-currency";

const rollupColumn = createColumnHelper<DataTableFeatures, CoverageBranchRow>();
const PLANNED_TOTAL_ID = "__planned_total__";

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

function pesoCell(value: number, emphasize = false) {
  return (
    <span className={emphasize ? "font-semibold" : undefined}>{formatPeso(value)}</span>
  );
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

  const rows = useMemo(() => {
    if (planned.length === 0) return branches;
    const totalRow: CoverageBranchRow = {
      branchId: PLANNED_TOTAL_ID,
      name: "Planned total",
      sapCode: "",
      planStatus: "planned",
      quotaPeso: totals.quotaPeso,
      historyPeso: totals.historyPeso,
      milQty: 0,
      milPeso: totals.milPeso,
      milDays: 0,
      allocQty: 0,
      allocPeso: totals.allocPeso,
      allocationDays: 0,
      targetDays: 0,
      drop1Qty: 0,
      drop1Peso: totals.drop1Peso,
      totalInventoryPeso: totals.totalInventoryPeso,
    };
    return [...branches, totalRow];
  }, [branches, planned.length, totals]);

  const columns = useMemo(() => {
    const cols: DataTableColumn<CoverageBranchRow>[] = [
      rollupColumn.display({
        id: "branch",
        header: "Branch",
        cell: ({ row }) =>
          row.original.branchId === PLANNED_TOTAL_ID ? (
            <span className="font-semibold">Planned total</span>
          ) : (
            <div className="min-w-0">
              <p className="font-medium">{row.original.name}</p>
              <p className="font-mono text-xs text-muted-foreground">{row.original.sapCode}</p>
            </div>
          ),
      }),
      rollupColumn.display({
        id: "status",
        header: "Status",
        cell: ({ row }) =>
          row.original.branchId === PLANNED_TOTAL_ID ? null : (
            <TableStatusBadge
              status={row.original.planStatus}
              activeValue="planned"
              label={planStatusLabel(row.original.planStatus)}
              variantMap={{
                planned: "default",
                no_history: "destructive",
                awaiting: "outline",
              }}
            />
          ),
      }),
      rollupColumn.display({
        id: "quota",
        header: "Quota",
        cell: ({ row }) =>
          pesoCell(row.original.quotaPeso, row.original.branchId === PLANNED_TOTAL_ID),
        meta: { align: "end", className: "font-mono" },
      }),
      rollupColumn.display({
        id: "history",
        header: "History",
        cell: ({ row }) =>
          pesoCell(row.original.historyPeso, row.original.branchId === PLANNED_TOTAL_ID),
        meta: { align: "end", className: "font-mono" },
      }),
      rollupColumn.display({
        id: "mil",
        header: "MIL",
        cell: ({ row }) =>
          pesoCell(row.original.milPeso, row.original.branchId === PLANNED_TOTAL_ID),
        meta: { align: "end", className: "font-mono" },
      }),
      rollupColumn.display({
        id: "allocation",
        header: "Allocation",
        cell: ({ row }) =>
          pesoCell(row.original.allocPeso, row.original.branchId === PLANNED_TOTAL_ID),
        meta: { align: "end", className: "font-mono" },
      }),
      rollupColumn.display({
        id: "days",
        header: "Alloc / target",
        cell: ({ row }) =>
          row.original.branchId === PLANNED_TOTAL_ID
            ? null
            : `${formatDays(row.original.allocationDays)} / ${formatDays(row.original.targetDays)}`,
        meta: { align: "end" },
      }),
      rollupColumn.display({
        id: "drop1",
        header: "Drop 1",
        cell: ({ row }) =>
          pesoCell(row.original.drop1Peso, row.original.branchId === PLANNED_TOTAL_ID),
        meta: { align: "end", className: "font-mono" },
      }),
      rollupColumn.display({
        id: "inventory",
        header: "Total inventory",
        cell: ({ row }) =>
          pesoCell(row.original.totalInventoryPeso, row.original.branchId === PLANNED_TOTAL_ID),
        meta: { align: "end", className: "font-mono" },
      }),
    ];
    return cols;
  }, []);

  return (
    <DataTable
      data={rows}
      columns={columns}
      getRowId={(row) => row.branchId}
      stickyHeader
      banner={
        <div className="border-b px-4 py-3">
          <h3 className="font-semibold">Branch roll-up</h3>
          <p className="text-sm text-muted-foreground">
            Every branch in the run, including NO HISTORY.
          </p>
        </div>
      }
      empty={branches.length === 0}
      emptyMessage="This plan has no branch rows yet."
    />
  );
}
