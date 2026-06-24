"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AppDataTable, AppDataTableBody } from "@/components/data-table";
import { useTableSelection } from "@/components/data-table/use-table-selection";
import { TablePagination } from "@/components/data-table/table-pagination";
import { TableSearchBar } from "@/components/data-table/table-search-bar";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface AllocationGapRow {
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
}

interface AllocationGapsTableProps {
  basePath: string;
  pageParam?: string;
  result: {
    items: AllocationGapRow[];
    total: number;
    page: number;
    totalPages: number;
  };
  branches: { id: string; name: string }[];
  currentBranch?: string;
  currentQ?: string;
  preserveParams?: Record<string, string>;
  showStockColumns?: boolean;
  suggestedQtyLabel?: boolean;
  emptyMessage?: string;
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
}: AllocationGapsTableProps) {
  const router = useRouter();
  const [branch, setBranch] = useState(currentBranch ?? "");
  const [q, setQ] = useState(currentQ ?? "");
  const selection = useTableSelection(result.items.map((item) => item.id));

  const hasActiveFilters = Boolean(currentBranch || currentQ);

  function applyFilters() {
    router.push(
      buildAllocationGapsHref(
        basePath,
        1,
        pageParam,
        { branch: branch || undefined, q: q.trim() || undefined },
        preserveParams,
      ),
    );
  }

  function clearFilters() {
    setBranch("");
    setQ("");
    router.push(buildAllocationGapsHref(basePath, 1, pageParam, {}, preserveParams));
  }

  return (
  <>
      <AppDataTable
        title="Allocation gaps"
        leading={
          result.total > 0 ? (
            <Badge variant="outline" className="text-amber-600">
              {result.total} SKU gap{result.total === 1 ? "" : "s"}
            </Badge>
          ) : null
        }
        shellHeader={
          <div className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="grid flex-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="gaps-branch">Branch</Label>
                  <Select
                    value={branch || "all"}
                    onValueChange={(value) => setBranch(value === "all" ? "" : value)}
                  >
                    <SelectTrigger id="gaps-branch">
                      <SelectValue placeholder="All branches" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All branches</SelectItem>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="gaps-q">Search</Label>
                  <TableSearchBar
                    value={q}
                    onChange={setQ}
                    placeholder="Branch or SKU…"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={applyFilters}>
                  Apply
                </Button>
                {hasActiveFilters ? (
                  <Button type="button" size="sm" variant="outline" onClick={clearFilters}>
                    Clear
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        }
        empty={result.items.length === 0}
        emptyMessage={emptyMessage}
      >
        <AppDataTableBody>
          {selection.selectedCount > 0 ? (
            <div className="px-4 pb-2">
              <Button variant="secondary" size="sm" onClick={selection.clearSelection}>
                {selection.selectedCount} selected
              </Button>
            </div>
          ) : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={selection.isAllSelected || (selection.isPartiallySelected ? "indeterminate" : false)}
                    onCheckedChange={(checked) => selection.toggleAll(checked === true)}
                    aria-label="Select all allocation gaps"
                  />
                </TableHead>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>SKU</TableHead>
                {showStockColumns ? (
                  <>
                    <TableHead>Stock</TableHead>
                    <TableHead>Max</TableHead>
                  </>
                ) : null}
                <TableHead>{suggestedQtyLabel ? "Suggested qty" : "Gap"}</TableHead>
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
                  <TableCell className="tabular-nums text-muted-foreground">{index + 1}</TableCell>
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
          </Table>
        </AppDataTableBody>
        <TablePagination
          meta={{
            total: result.total,
            page: result.page,
            totalPages: result.totalPages,
            itemLabel: "gap",
          }}
          buildHref={(page) =>
            buildAllocationGapsHref(
              basePath,
              page,
              pageParam,
              { branch: currentBranch, q: currentQ },
              preserveParams,
            )
          }
        />
      </AppDataTable>

      {hasActiveFilters ? (
        <p className="text-xs text-muted-foreground">
          Filtered results.
          <Button variant="link" className="ml-1 h-auto p-0 text-xs" asChild>
            <Link href={buildAllocationGapsHref(basePath, 1, pageParam, {}, preserveParams)}>
              Show all gaps
            </Link>
          </Button>
        </p>
      ) : null}
  </>
  );
}
