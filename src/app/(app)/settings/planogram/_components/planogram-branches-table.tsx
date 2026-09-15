"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ChevronRight, Upload } from "lucide-react";

import { ImportPlanogramDialog } from "@/app/(app)/settings/planogram/_components/import-planogram-dialog";
import {
  DataTableEmptyState,
  TableEmptyRow,
  TableIndexCell,
  TableIndexHead,
  TableRowActions,
  uniqueSearchSuggestions,
  useClientTablePagination,
} from "@/components/data-table";
import { GlobalDataTable, GlobalTableHead, useClientTableSort } from "@/lib/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingModal } from "@/components/ui/loading-modal";
import {
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ALLOWED_MODEL_CHIP_LIMIT,
  buildBranchPlanogramHref,
  matchesPlanogramIndexView,
  type PlanogramIndexBranch,
  type PlanogramIndexView,
} from "@/features/planogram/lib/planogram-index";
import { matchesTableSearch } from "@/utils/match-table-search";
import { cn } from "@/utils/cn";

interface PlanogramBranchesTableProps {
  branches: PlanogramIndexBranch[];
  view: PlanogramIndexView | null;
  query: string;
  onQueryChange: (query: string) => void;
  canManage?: boolean;
}

const COL_COUNT = 5;

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
  const [opening, setOpening] = useState(false);

  function openBranch(branchId: string) {
    if (opening) return;
    setOpening(true);
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
      <GlobalDataTable
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
        pageSize={{ value: pageSize, onChange: setPageSize }}
        pagination={{
          total,
          page,
          totalPages,
          itemLabel: "branches",
          onPageChange: setPage,
        }}
      >
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableIndexHead />
              <GlobalTableHead className="whitespace-nowrap" {...sort.sortProps("sapCode")}>
                SAP code
              </GlobalTableHead>
              <GlobalTableHead className="whitespace-nowrap" {...sort.sortProps("name")}>
                Branch
              </GlobalTableHead>
              <GlobalTableHead className="min-w-[24rem]" {...sort.sortProps("allowedModels")}>
                Allowed Models
              </GlobalTableHead>
              <GlobalTableHead className="text-right"> </GlobalTableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableEmptyRow colSpan={COL_COUNT} message={emptyMessage(view)} />
            ) : (
              pageItems.map((branch, index) => (
                <TableRow
                  key={branch.id}
                  className={cn(
                    "cursor-pointer",
                    index % 2 === 1 && "bg-table-stripe",
                  )}
                  onClick={() => openBranch(branch.id)}
                >
                  <TableIndexCell index={indexOffset + index + 1} />
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {branch.sapCode}
                  </TableCell>
                  <TableCell className="font-medium">{branch.name}</TableCell>
                  <TableCell className="min-w-[24rem] py-2">
                    <AllowedModelChips skuCodes={branch.allowedSkuCodes} />
                  </TableCell>
                  <TableRowActions>
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openBranch(branch.id);
                      }}
                    >
                      Open
                      <ChevronRight className="size-4" />
                    </Button>
                  </TableRowActions>
                </TableRow>
              ))
            )}
          </TableBody>
      </GlobalDataTable>
      {canManage ? (
        <ImportPlanogramDialog open={importing} onOpenChange={setImporting} />
      ) : null}
      <LoadingModal
        open={opening}
        variant="minimal"
        title="Opening planogram"
        description="Please wait while we load this branch."
      />
    </div>
  );
}
