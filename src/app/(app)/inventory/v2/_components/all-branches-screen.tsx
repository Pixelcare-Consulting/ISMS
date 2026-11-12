"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";

import {
  aggregateBranchInventory,
  aggregateOffPlanogram,
  topBranchByDefective,
  topOffPlanogramBranch,
} from "@/app/(app)/inventory/v2/_components/v2-branch-aggregates";
import { V2Chrome } from "@/app/(app)/inventory/v2/_components/v2-chrome";
import { V2MetricCard } from "@/app/(app)/inventory/v2/_components/v2-metric-card";
import { V2TealLink } from "@/app/(app)/inventory/v2/_components/v2-teal-link";
import { branchInventoryV2Href } from "@/app/(app)/inventory/v2/links";
import { SidebarNavCountBadge } from "@/app/(app)/_components/sidebar-nav-count-badge";
import { useClientTablePagination } from "@/components/data-table";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { InventoryGroupBranchItemDto } from "@/features/inventory/actions/inventory.actions";
import {
  branchInventoryUnitTotal,
  isBranchInventoryV2HiddenStatus,
} from "@/features/inventory/utils/branch-inventory-v2";
import type { InventoryGroupStatusCount } from "@/features/inventory/utils/stock-units-group-aggregates";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import { DataTable, type DataTableColumn, type DataTableFeatures } from "@/lib/data-table";

interface AllBranchesScreenProps {
  branches: InventoryGroupBranchItemDto[];
  offPlanogramBranches: InventoryGroupBranchItemDto[];
  /** Peso value of each card's quantity. Computed on the server. */
  cardAmounts: {
    total: number;
    inStock: number;
    defective: number;
    offPlanogram: number;
  };
  initialOffPlanogram?: boolean;
  /** Unread units for each branch and status. Hidden when that branch has none. */
  unreadByBranchCode?: Record<string, Record<string, number>>;
  seriesSummary?: ReactNode;
}

const branchColumn = createColumnHelper<DataTableFeatures, InventoryGroupBranchItemDto>();

function statusColumns(branches: InventoryGroupBranchItemDto[]): InventoryGroupStatusCount[] {
  const withStatuses = branches.find((row) => (row.counts.statuses?.length ?? 0) > 0);
  return (withStatuses?.counts.statuses ?? []).filter(
    (status) => !isBranchInventoryV2HiddenStatus(status.code),
  );
}

function countForStatus(
  row: InventoryGroupBranchItemDto,
  code: string,
): number {
  return (row.counts.statuses ?? []).find((item) => item.code === code)?.count ?? 0;
}

export function BranchInventoryAllBranchesScreen({
  branches,
  offPlanogramBranches,
  cardAmounts,
  initialOffPlanogram = false,
  unreadByBranchCode = {},
  seriesSummary,
}: AllBranchesScreenProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [offPlanogramOnly, setOffPlanogramOnly] = useState(initialOffPlanogram);
  const statusCols = statusColumns(branches);
  const aggregates = useMemo(() => aggregateBranchInventory(branches), [branches]);
  const offPlanogramTotal = useMemo(
    () => aggregateOffPlanogram(offPlanogramBranches),
    [offPlanogramBranches],
  );
  const topDefectiveBranch = useMemo(() => topBranchByDefective(branches), [branches]);
  const topOffBranch = useMemo(
    () => topOffPlanogramBranch(offPlanogramBranches),
    [offPlanogramBranches],
  );
  const unfilteredSearch = query.trim().length === 0 && !offPlanogramOnly;

  const offPlanogramCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of offPlanogramBranches) {
      counts.set(row.branch.id, branchInventoryUnitTotal(row.counts));
    }
    return counts;
  }, [offPlanogramBranches]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let rows = [...branches].sort((left, right) =>
      left.branch.name.localeCompare(right.branch.name, undefined, { sensitivity: "base" }),
    );
    if (offPlanogramOnly) {
      rows = rows.filter((row) => (offPlanogramCounts.get(row.branch.id) ?? 0) > 0);
    }
    if (!needle) return rows;
    return rows.filter((row) => {
      const name = row.branch.name.toLowerCase();
      const sap = row.branch.sapCode.toLowerCase();
      return name.includes(needle) || sap.includes(needle);
    });
  }, [branches, query, offPlanogramOnly, offPlanogramCounts]);

  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    total,
    totalPages,
    pageItems,
    indexOffset,
  } = useClientTablePagination(filtered, {
    resetKey: `${query}:${offPlanogramOnly ? "off" : "all"}`,
  });

  const filteredGrandTotal = filtered.reduce(
    (sum, row) => sum + branchInventoryUnitTotal(row.counts),
    0,
  );

  const columns = useMemo((): DataTableColumn<InventoryGroupBranchItemDto>[] => {
    const cols: DataTableColumn<InventoryGroupBranchItemDto>[] = [
      branchColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => indexOffset + row.index + 1,
        meta: {
          mobile: "detail",
          className: "w-12 pl-4 text-center tabular-nums text-muted-foreground",
        },
      }),
      branchColumn.accessor((row) => row.branch.name, {
        id: "branch",
        header: "Branch",
        enableSorting: false,
        cell: ({ row }) => {
          const offCount = offPlanogramCounts.get(row.original.branch.id) ?? 0;
          const defectiveCount = row.original.counts.defective;
          return (
            <div className="min-w-0">
              <span className="block font-medium">{row.original.branch.name}</span>
              <span className="text-xs text-muted-foreground">{row.original.branch.sapCode}</span>
              {offCount > 0 ? (
                <span className="mt-0.5 block text-xs text-amber-700 dark:text-amber-400">
                  · {offCount.toLocaleString()} off-planogram
                </span>
              ) : null}
              {defectiveCount > 0 ? (
                <span className="mt-0.5 block text-xs text-rose-700 dark:text-rose-400">
                  · {defectiveCount.toLocaleString()} defective
                </span>
              ) : null}
            </div>
          );
        },
        meta: { wrap: true, mobile: "primary", className: "min-w-[10rem]" },
      }),
      branchColumn.accessor((row) => branchInventoryUnitTotal(row.counts), {
        id: "total",
        header: "Total units",
        enableSorting: false,
        cell: ({ row }) => branchInventoryUnitTotal(row.original.counts).toLocaleString(),
        meta: { align: "end", mobile: "primary", className: "tabular-nums" },
      }),
    ];

    for (const status of statusCols) {
      cols.push(
        branchColumn.display({
          id: `status-${status.code}`,
          header: () => (
            <StatusCodeBadge
              code={status.code}
              name={status.name}
              color={status.color}
              codeOnly
              className="normal-case tracking-normal"
            />
          ),
          enableSorting: false,
          cell: ({ row }) => {
            const unread =
              unreadByBranchCode[row.original.branch.id]?.[status.code] ?? 0;
            return (
              <span className="inline-flex items-center justify-end whitespace-nowrap">
                {countForStatus(row.original, status.code).toLocaleString()}
                <SidebarNavCountBadge count={unread} className="mt-0" />
              </span>
            );
          },
          meta: { align: "end", mobile: "detail", className: "tabular-nums text-xs" },
        }),
      );
    }

    cols.push(
      // DO NOT UNCOMMENT THIS, IT'S NOT USED ANYMORE 
      // branchColumn.display({
      //   id: "offPlanogram",
      //   header: "Off planogram",
      //   enableSorting: false,
      //   cell: ({ row }) => {
      //     const offCount = offPlanogramCounts.get(row.original.branch.id) ?? 0;
      //     return offCount > 0 ? offCount.toLocaleString() : "—";
      //   },
      //   meta: { align: "end", mobile: "detail", className: "tabular-nums" },
      // }),
      branchColumn.display({
        id: "open",
        header: () => <span className="sr-only">Open</span>,
        enableSorting: false,
        cell: ({ row }) => (
          <V2TealLink href={branchInventoryV2Href({ branchId: row.original.branch.id })}>
            Open branch →
          </V2TealLink>
        ),
        meta: { align: "end", mobile: "primary" },
      }),
    );

    return cols;
  }, [indexOffset, offPlanogramCounts, statusCols, unreadByBranchCode]);

  function toggleOffPlanogram(checked: boolean) {
    setOffPlanogramOnly(checked);
    router.push(branchInventoryV2Href({ offPlanogram: checked || undefined }));
  }

  return (
    <div className="space-y-6">
      <V2Chrome
        screen="home"
        subtitle="Browse stock across all branches. Open a branch to explore models and individual units."
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <V2MetricCard
          variant="white"
          label="Total inventory"
          value={aggregates.totalUnits}
          amount={cardAmounts.total}
          subtext={`Across ${aggregates.branchCount.toLocaleString()} ${
            aggregates.branchCount === 1 ? "branch" : "branches"
          }`}
        />
        <V2MetricCard
          variant="white"
          label="In stock (STK)"
          value={aggregates.stk}
          amount={cardAmounts.inStock}
          subtext="Available across branches"
        />
        <V2MetricCard
          variant="rose"
          label="Defective"
          value={aggregates.defectiveTotal}
          amount={cardAmounts.defective}
          subtext={
            topDefectiveBranch && aggregates.defectiveTotal > 0
              ? `Most at ${topDefectiveBranch.branch.name}`
              : undefined
          }
        />
        <V2MetricCard
          variant="amber"
          label="Off planogram"
          value={offPlanogramTotal}
          amount={cardAmounts.offPlanogram}
          subtext={
            topOffBranch && offPlanogramTotal > 0
              ? `Most at ${topOffBranch.branch.name}`
              : undefined
          }
        />
      </section>

      {seriesSummary ? <div className="motion-reduce:transition-none">{seriesSummary}</div> : null}

      <DataTable
        data={pageItems}
        columns={columns}
        getRowId={(row) => row.branch.id}
        stickyHeader
        chrome="card"
        className="overflow-x-auto"
        tableClassName="min-w-[56rem]"
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search branch, model or serial number…",
        }}
        pageSize={{ value: pageSize, onChange: setPageSize }}
        pagination={{
          total,
          page,
          totalPages,
          itemLabel: "branch",
          onPageChange: setPage,
        }}
        toolbarActions={
          <div className="flex items-center gap-2">
            <Checkbox
              id="v2-off-planogram"
              checked={offPlanogramOnly}
              aria-label="Off-planogram only"
              onCheckedChange={(checked) => toggleOffPlanogram(checked === true)}
            />
            <Label htmlFor="v2-off-planogram" className="font-normal">
              Off-planogram only
            </Label>
          </div>
        }
        empty={filtered.length === 0}
        emptyMessage={
          offPlanogramOnly
            ? "No branches with off-planogram units match your search."
            : "No branches match your search."
        }
        footer={
          filtered.length > 0 ? (
            <footer className="space-y-2 border-t px-4 py-3 text-xs text-muted-foreground">
              <p>
                {unfilteredSearch
                  ? `Showing all ${filtered.length.toLocaleString()} ${
                      filtered.length === 1 ? "branch" : "branches"
                    }`
                  : `Showing ${filtered.length.toLocaleString()} ${
                      filtered.length === 1 ? "branch" : "branches"
                    }`}{" "}
                · {filteredGrandTotal.toLocaleString()} total units
              </p>
              <p>
                DIT and FPO retain your existing system labels. Off-planogram is a flag, not a
                separate stock status.
              </p>
            </footer>
          ) : null
        }
      />
    </div>
  );
}
