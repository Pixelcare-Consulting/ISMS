"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_TABLE_PAGE_SIZE,
  parseTablePageSize,
  type TablePageSize,
} from "@/components/data-table/table-page-size";
import { useTableSelection } from "@/components/data-table/use-table-selection";
import {
  TableSearchBar,
  uniqueSearchSuggestions,
} from "@/components/data-table/table-search-bar";
import { GlobalDataTable, GlobalTableHead, nextTableSort } from "@/lib/data-table";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";export interface AllocationGapRow {
  id: string;
  gapQty: number;
  planogramMax: number;
  currentStock: number;
  branch: { name: string };
  model: { skuCode: string; name: string };
}

interface AllocationGapsFilters {
  branch?: string;
  q?: string;
  sort?: string;
  dir?: string;
  limit?: number;
}

type AllocationGapSortField = "branch" | "sku" | "currentStock" | "planogramMax" | "gapQty";
type AllocationGapSortDir = "asc" | "desc";

interface AllocationGapsTableProps {
  basePath: string;
  pageParam?: string;
  result: {
    items: AllocationGapRow[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  branches: { id: string; name: string }[];
  currentBranch?: string;
  currentQ?: string;
  preserveParams?: Record<string, string>;
  showStockColumns?: boolean;
  suggestedQtyLabel?: boolean;
  emptyMessage?: string;
  initialSort?: string;
  initialSortDir?: string;
}

function buildAllocationGapsHref(
  basePath: string,
  page: number,
  pageParam: string,
  filters: AllocationGapsFilters = {},
  preserveParams: Record<string, string> = {},
): string {
  const params = new URLSearchParams(preserveParams);

  if (page > 1) params.set(pageParam, String(page));
  else params.delete(pageParam);

  if (filters.branch) params.set("branch", filters.branch);
  else params.delete("branch");

  if (filters.q) params.set("q", filters.q);
  else params.delete("q");

  if (filters.sort) params.set("sort", filters.sort);
  else params.delete("sort");

  if (filters.sort && filters.dir) params.set("dir", filters.dir);
  else params.delete("dir");

  const limit = parseTablePageSize(filters.limit);
  if (limit !== DEFAULT_TABLE_PAGE_SIZE) params.set("limit", String(limit));
  else params.delete("limit");

  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function AllocationGapsTable({
  basePath,
  pageParam = "page",
  result,
  branches,
  currentBranch,
  currentQ,
  preserveParams = {},
  showStockColumns = true,
  suggestedQtyLabel = false,
  emptyMessage = "No gaps — run allocation after planogram sync.",
  initialSort = "",
  initialSortDir = "desc",
}: AllocationGapsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [branch, setBranch] = useState(currentBranch ?? "");
  const [q, setQ] = useState(currentQ ?? "");
  const selection = useTableSelection(result.items.map((item) => item.id));
  const sort = (searchParams.get("sort") ?? initialSort) || "";
  const sortDir = (
    (searchParams.get("dir") ?? initialSortDir) === "asc" ? "asc" : "desc"
  ) as AllocationGapSortDir;
  const pageSize = parseTablePageSize(
    searchParams.get("limit") ?? result.limit,
  );
  const indexOffset = (result.page - 1) * pageSize;

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        branches.map((b) => b.name),
        result.items.map((item) => item.branch.name),
        result.items.map((item) => item.model.skuCode),
        result.items.map((item) => item.model.name),
      ),
    [branches, result.items],
  );

  const hasActiveFilters = Boolean(currentBranch || currentQ);
  const showClear = hasActiveFilters || Boolean(branch || q.trim());

  const activeFilters = {
    branch: currentBranch,
    q: currentQ,
    sort: sort || undefined,
    dir: sort ? sortDir : undefined,
    limit: pageSize,
  };

  function applyFilters() {
    router.push(
      buildAllocationGapsHref(
        basePath,
        1,
        pageParam,
        {
          branch: branch || undefined,
          q: q.trim() || undefined,
          sort: sort || undefined,
          dir: sort ? sortDir : undefined,
          limit: pageSize,
        },
        preserveParams,
      ),
    );
  }

  function clearFilters() {
    setBranch("");
    setQ("");
    router.push(
      buildAllocationGapsHref(
        basePath,
        1,
        pageParam,
        { limit: pageSize },
        preserveParams,
      ),
    );
  }

  function handlePageSizeChange(limit: TablePageSize) {
    router.push(
      buildAllocationGapsHref(
        basePath,
        1,
        pageParam,
        {
          branch: currentBranch,
          q: currentQ,
          sort: sort || undefined,
          dir: sort ? sortDir : undefined,
          limit,
        },
        preserveParams,
      ),
    );
  }

  function toggleSort(field: AllocationGapSortField) {
    const next = nextTableSort(field, sort, sortDir);
    router.push(
      buildAllocationGapsHref(
        basePath,
        1,
        pageParam,
        {
          branch: currentBranch,
          q: currentQ,
          sort: next.sort,
          dir: next.dir,
          limit: pageSize,
        },
        preserveParams,
      ),
    );
  }

  return (
      <GlobalDataTable
        stickyHeader
        pageSize={{ value: pageSize, onChange: handlePageSizeChange }}
        toolbarLeading={
          <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex shrink-0 items-center gap-2">
              <span className="whitespace-nowrap text-sm font-medium text-muted-foreground">
                Branch
              </span>
              <SearchableSelect
                id="gaps-branch"
                className="w-52"
                options={[
                  { id: "all", label: "All branches" },
                  ...branches.map((b) => ({ id: b.id, label: b.name })),
                ]}
                value={branch || "all"}
                onChange={(value) => setBranch(value === "all" ? "" : value)}
                placeholder="All branches"
                searchPlaceholder="Search branches…"
              />
            </div>
            <TableSearchBar
              value={q}
              onChange={setQ}
              placeholder="Search Branch or SKU…"
              suggestions={suggestions}
              className="w-full sm:max-w-sm"
            />
            <div className="flex shrink-0 items-center gap-2">
              <Button type="button" size="sm" onClick={applyFilters}>
                Apply
              </Button>
              {showClear ? (
                <Button type="button" size="sm" variant="outline" onClick={clearFilters}>
                  Clear
                </Button>
              ) : null}
            </div>
          </div>
        }
        toolbarActions={
          <>
            {selection.selectedCount > 0 ? (
              <Button variant="secondary" size="sm" onClick={selection.clearSelection}>
                {selection.selectedCount} selected
              </Button>
            ) : null}
            <span className="text-sm font-medium">Allocation gaps</span>
            {result.total > 0 ? (
              <Badge variant="outline" className="text-amber-600">
                {result.total} SKU gap{result.total === 1 ? "" : "s"}
              </Badge>
            ) : null}
          </>
        }
        empty={result.items.length === 0}
        emptyMessage={emptyMessage}
        banner={
          hasActiveFilters ? (
            <p className="border-b px-4 py-2 text-xs text-muted-foreground">
              Filtered results.
              <Button variant="link" className="ml-1 h-auto p-0 text-xs" asChild>
                <Link
                  href={buildAllocationGapsHref(
                    basePath,
                    1,
                    pageParam,
                    { limit: pageSize },
                    preserveParams,
                  )}
                >
                  Show all gaps
                </Link>
              </Button>
            </p>
          ) : null
        }
        pagination={{
          total: result.total,
          page: result.page,
          totalPages: result.totalPages,
          itemLabel: "gap",
          buildHref: (page) =>
            buildAllocationGapsHref(
              basePath,
              page,
              pageParam,
              activeFilters,
              preserveParams,
            ),
        }}
      >
            <TableHeader>
              <TableRow>
                <GlobalTableHead className="w-10">
                  <Checkbox
                    checked={selection.isAllSelected || (selection.isPartiallySelected ? "indeterminate" : false)}
                    onCheckedChange={(checked) => selection.toggleAll(checked === true)}
                    aria-label="Select all allocation gaps"
                  />
                </GlobalTableHead>
                <GlobalTableHead className="w-12">#</GlobalTableHead>
                <GlobalTableHead
                  sortKey="branch"
                  activeSortKey={sort}
                  sortDirection={sortDir}
                  onSort={(key) => toggleSort(key as AllocationGapSortField)}
                >
                  Branch
                </GlobalTableHead>
                <GlobalTableHead
                  sortKey="sku"
                  activeSortKey={sort}
                  sortDirection={sortDir}
                  onSort={(key) => toggleSort(key as AllocationGapSortField)}
                >
                  SKU
                </GlobalTableHead>
                {showStockColumns ? (
                  <>
                    <GlobalTableHead
                      sortKey="currentStock"
                      activeSortKey={sort}
                      sortDirection={sortDir}
                      onSort={(key) => toggleSort(key as AllocationGapSortField)}
                    >
                      Stock
                    </GlobalTableHead>
                    <GlobalTableHead
                      sortKey="planogramMax"
                      activeSortKey={sort}
                      sortDirection={sortDir}
                      onSort={(key) => toggleSort(key as AllocationGapSortField)}
                    >
                      Max
                    </GlobalTableHead>
                  </>
                ) : null}
                <GlobalTableHead
                  sortKey="gapQty"
                  activeSortKey={sort}
                  sortDirection={sortDir}
                  onSort={(key) => toggleSort(key as AllocationGapSortField)}
                >
                  {suggestedQtyLabel ? "Suggested qty" : "Gap"}
                </GlobalTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.map((g, index) => (
                <TableRow key={g.id} data-state={selection.isRowSelected(g.id) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={selection.isRowSelected(g.id)}
                      onCheckedChange={(checked) => selection.toggleRow(g.id, checked === true)}
                      aria-label={`Select gap ${g.model.skuCode}`}
                    />
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {indexOffset + index + 1}
                  </TableCell>
                  <TableCell>{g.branch.name}</TableCell>
                  <TableCell className="font-mono text-sm">{g.model.skuCode}</TableCell>
                  {showStockColumns ? (
                    <>
                      <TableCell>{g.currentStock}</TableCell>
                      <TableCell>{g.planogramMax}</TableCell>
                    </>
                  ) : null}
                  <TableCell className="font-medium text-amber-600">{g.gapQty}</TableCell>
                </TableRow>
              ))}
            </TableBody>
      </GlobalDataTable>
  );
}
