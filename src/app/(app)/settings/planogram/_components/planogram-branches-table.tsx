"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { ChevronRight, Upload } from "lucide-react";

import { ImportPlanogramDialog } from "@/app/(app)/settings/planogram/_components/import-planogram-dialog";
import {
  DataTableEmptyState,
  TableRowActions,
  uniqueSearchSuggestions,
  useClientTablePagination,
} from "@/components/data-table";
import {
  DataTable,
  useClientTableSort,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingModal } from "@/components/ui/loading-modal";
import {
  ALLOWED_MODEL_CHIP_LIMIT,
  buildBranchPlanogramHref,
  matchesPlanogramIndexView,
  type PlanogramIndexBranch,
  type PlanogramIndexView,
} from "@/features/planogram/lib/planogram-index";
import { matchesTableSearch } from "@/utils/match-table-search";

const planogramColumn = createColumnHelper<DataTableFeatures, PlanogramIndexBranch>();

interface PlanogramBranchesTableProps {
  branches: PlanogramIndexBranch[];
  view: PlanogramIndexView | null;
  query: string;
  onQueryChange: (query: string) => void;
  canManage?: boolean;
}

function emptyMessage(view: PlanogramIndexView | null): string {
  if (view == null) return "No branches match your search.";
  if (view === "empty") {
    return "No branches match this filter. Open a branch to add SKUs (Allowed models first) or Import the Planogram template.";
  }
  return "No branches match this filter.";
}

function AllowedModelChips({ skuCodes }: { skuCodes: string[] }) {
  if (skuCodes.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  const visible = skuCodes.slice(0, ALLOWED_MODEL_CHIP_LIMIT);
  const hiddenCount = skuCodes.length - visible.length;
  const hidden = hiddenCount > 0 ? skuCodes.slice(ALLOWED_MODEL_CHIP_LIMIT) : [];

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((sku, index) => (
        <Badge
          key={`${sku}-${index}`}
          variant="secondary"
          className="font-mono text-[11px]"
        >
          {sku}
        </Badge>
      ))}
      {hiddenCount > 0 ? (
        <Badge
          className="bg-emerald-500 font-semibold tracking-wide text-white hover:bg-emerald-500"
          title={hidden.join(", ")}
        >
          +{hiddenCount} MORE...
        </Badge>
      ) : null}
    </div>
  );
}

export function PlanogramBranchesTable({
  branches,
  view,
  query,
  onQueryChange,
  canManage = false,
}: PlanogramBranchesTableProps) {
  const router = useRouter();
  const [importing, setImporting] = useState(false);
  const [openingBranchName, setOpeningBranchName] = useState<string | null>(null);

  function openBranch(branchId: string, branchName: string) {
    if (openingBranchName) return;
    setOpeningBranchName(branchName);
    router.push(buildBranchPlanogramHref(branchId, { view, q: query }));
  }

  const viewFiltered = useMemo(
    () => branches.filter((branch) => matchesPlanogramIndexView(branch, view)),
    [branches, view],
  );

  const filtered = useMemo(
    () =>
      viewFiltered.filter((branch) =>
        matchesTableSearch(query, [
          branch.name,
          branch.sapCode,
          ...branch.allowedSkuCodes,
        ]),
      ),
    [viewFiltered, query],
  );

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        viewFiltered.map((branch) => branch.name),
        viewFiltered.map((branch) => branch.sapCode),
        viewFiltered.flatMap((branch) => branch.allowedSkuCodes),
      ),
    [viewFiltered],
  );

  const sort = useClientTableSort(filtered, {
    name: (branch) => branch.name,
    sapCode: (branch) => branch.sapCode,
    allowedModels: (branch) => branch.allowedSkuCodes.length,
  });
  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    total,
    totalPages,
    pageItems,
    indexOffset,
  } = useClientTablePagination(sort.sorted, {
    resetKey: `${view ?? "all"}:${query}:${sort.sortKey}:${sort.sortDir}`,
  });

  const columns = useMemo(() => {
    const cols: DataTableColumn<PlanogramIndexBranch>[] = [
      planogramColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => indexOffset + row.index + 1,
        meta: { className: "tabular-nums text-muted-foreground" },
      }),
      planogramColumn.display({
        id: "sapCode",
        header: "SAP code",
        enableSorting: true,
        cell: ({ row }) => (
          <button
            type="button"
            className="font-mono text-sm text-muted-foreground"
            onClick={() => openBranch(row.original.id, row.original.name)}
          >
            {row.original.sapCode}
          </button>
        ),
      }),
      planogramColumn.display({
        id: "name",
        header: "Branch",
        enableSorting: true,
        cell: ({ row }) => (
          <button
            type="button"
            className="font-medium"
            onClick={() => openBranch(row.original.id, row.original.name)}
          >
            {row.original.name}
          </button>
        ),
      }),
      planogramColumn.display({
        id: "allowedModels",
        header: "Allowed Models",
        enableSorting: true,
        cell: ({ row }) => (
          <button
            type="button"
            className="text-left"
            onClick={() => openBranch(row.original.id, row.original.name)}
          >
            <AllowedModelChips skuCodes={row.original.allowedSkuCodes} />
          </button>
        ),
        meta: { wrap: true, className: "min-w-[24rem]" },
      }),
      planogramColumn.display({
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <TableRowActions asCell={false}>
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => openBranch(row.original.id, row.original.name)}
            >
              Open
              <ChevronRight className="size-4" />
            </Button>
          </TableRowActions>
        ),
        meta: { align: "end" },
      }),
    ];
    return cols;
  }, [indexOffset, openingBranchName, query, view]);

  if (branches.length === 0) {
    return (
      <div className="space-y-4">
        {canManage ? (
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setImporting(true)}>
              <Upload className="mr-1 size-4" />
              Import
            </Button>
          </div>
        ) : null}
        <DataTableEmptyState message="No branches available for your account." />
        {canManage ? (
          <ImportPlanogramDialog open={importing} onOpenChange={setImporting} />
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Branches</h2>
      <DataTable
        data={pageItems}
        columns={columns}
        getRowId={(row) => row.id}
        manualSorting
        manualPagination
        enableSorting
        sorting={{
          sortKey: sort.sortKey,
          sortDir: sort.sortDir,
          onSort: sort.toggleSort,
        }}
        stickyHeader
        search={{
          value: query,
          onChange: onQueryChange,
          placeholder: "Search by branch name, SAP code, or SKU…",
          suggestions,
        }}
        toolbarActions={
          canManage ? (
            <Button variant="outline" size="sm" onClick={() => setImporting(true)}>
              <Upload className="mr-1 size-4" />
              Import
            </Button>
          ) : undefined
        }
        empty={pageItems.length === 0}
        emptyMessage={emptyMessage(view)}
        pageSize={{ value: pageSize, onChange: setPageSize }}
        pagination={{
          total,
          page,
          totalPages,
          itemLabel: "branches",
          onPageChange: setPage,
        }}
      />
      {canManage ? (
        <ImportPlanogramDialog open={importing} onOpenChange={setImporting} />
      ) : null}
      <LoadingModal
        open={openingBranchName != null}
        variant="minimal"
        title={
          openingBranchName
            ? `Opening ${openingBranchName} planogram`
            : "Opening planogram"
        }
        description="Please wait while we load this branch."
      />
    </div>
  );
}
