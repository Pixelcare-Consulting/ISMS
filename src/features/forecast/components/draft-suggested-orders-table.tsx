"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  TableIndexCell,
  TableIndexHead,
  TableSelectionBadge,
  uniqueSearchSuggestions,
  useTableSelection,
} from "@/components/data-table";
import {
  DEFAULT_TABLE_PAGE_SIZE,
  parseTablePageSize,
  type TablePageSize,
} from "@/components/data-table/table-page-size";
import { TableSearchBar } from "@/components/data-table/table-search-bar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OrderStatusBadge } from "@/features/orders/components/order-status-badge";
import { OrderTypeBadge } from "@/features/orders/components/order-type-badge";
import { GlobalDataTable, GlobalTableHead, nextTableSort } from "@/lib/data-table";
import { cn } from "@/utils/cn";

interface DraftOrderRow {
  id: string;
  orderNumber: string;
  status: string;
  branch: { id: string; name: string; sapCode: string };
  details: { quantity: number; model: { skuCode: string; name: string } }[];
}

interface DraftFilters {
  branch?: string;
  q?: string;
  sort?: string;
  dir?: string;
  limit?: number;
}

type DraftSortField = "sap" | "orderNumber" | "branch" | "status";
type DraftSortDir = "asc" | "desc";

interface DraftSuggestedOrdersTableProps {
  basePath: string;
  pageParam?: string;
  result: {
    items: DraftOrderRow[];
    total: number;
    page: number;
    totalPages: number;
    limit: number;
  };
  branches: { id: string; name: string }[];
  currentBranch?: string;
  currentQ?: string;
  preserveParams?: Record<string, string>;
  initialSort?: string;
  initialSortDir?: string;
}

function buildDraftsHref(
  basePath: string,
  page: number,
  pageParam: string,
  filters: DraftFilters = {},
  preserveParams: Record<string, string> = {},
): string {
  const params = new URLSearchParams(preserveParams);

  if (page > 1) params.set(pageParam, String(page));
  else params.delete(pageParam);

  if (filters.branch) params.set("draftBranch", filters.branch);
  else params.delete("draftBranch");

  if (filters.q) params.set("draftQ", filters.q);
  else params.delete("draftQ");

  if (filters.sort) params.set("draftSort", filters.sort);
  else params.delete("draftSort");

  if (filters.sort && filters.dir) params.set("draftDir", filters.dir);
  else params.delete("draftDir");

  const limit = parseTablePageSize(filters.limit);
  if (limit !== DEFAULT_TABLE_PAGE_SIZE) params.set("draftLimit", String(limit));
  else params.delete("draftLimit");

  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function DraftSuggestedOrdersTable({
  basePath,
  pageParam = "page",
  result,
  branches,
  currentBranch,
  currentQ,
  preserveParams = {},
  initialSort = "",
  initialSortDir = "desc",
}: DraftSuggestedOrdersTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [branch, setBranch] = useState(currentBranch ?? "");
  const [q, setQ] = useState(currentQ ?? "");
  const selection = useTableSelection(result.items.map((item) => item.id));
  const sort = (searchParams.get("draftSort") ?? initialSort) || "";
  const sortDir = (
    (searchParams.get("draftDir") ?? initialSortDir) === "asc" ? "asc" : "desc"
  ) as DraftSortDir;
  const pageSize = parseTablePageSize(
    searchParams.get("draftLimit") ?? result.limit,
  );

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        result.items.map((item) => item.orderNumber),
        result.items.map((item) => item.branch.sapCode),
        result.items.map((item) => item.branch.name),
        result.items.flatMap((item) =>
          item.details.flatMap((detail) => [detail.model.skuCode, detail.model.name]),
        ),
      ),
    [result.items],
  );

  const hasActiveFilters = Boolean(currentBranch || currentQ);
  const showClear = hasActiveFilters || Boolean(branch || q.trim());
  const indexOffset = (result.page - 1) * pageSize;

  function applyFilters() {
    router.push(
      buildDraftsHref(
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
      buildDraftsHref(basePath, 1, pageParam, { limit: pageSize }, preserveParams),
    );
  }

  function handlePageSizeChange(limit: TablePageSize) {
    router.push(
      buildDraftsHref(
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

  function toggleSort(field: DraftSortField) {
    const next = nextTableSort(field, sort, sortDir);
    router.push(
      buildDraftsHref(
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
    <section className="space-y-2">
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
                id="drafts-branch"
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
              placeholder="Order #, SAP Code, branch, SKU…"
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
            <span className="text-sm font-medium">Draft auto-replenish orders</span>
            <TableSelectionBadge
              count={selection.selectedCount}
              onClear={selection.clearSelection}
              size="sm"
            />
          </>
        }
        empty={result.items.length === 0}
        emptyClassName="px-6 py-16"
        emptyMessage={
          <span className="mx-auto block max-w-sm space-y-1">
            <span className="block text-sm font-medium text-foreground">
              No replenish drafts yet
            </span>
            <span className="block text-sm">
              On Planning, run allocation, then generate suggested orders from
              the popup.
            </span>
          </span>
        }
        banner={
          hasActiveFilters ? (
            <p className="border-b px-4 py-2 text-xs text-muted-foreground">
              Filtered results.
              <Button variant="link" className="ml-1 h-auto p-0 text-xs" asChild>
                <Link
                  href={buildDraftsHref(
                    basePath,
                    1,
                    pageParam,
                    { limit: pageSize },
                    preserveParams,
                  )}
                >
                  Show all drafts
                </Link>
              </Button>
            </p>
          ) : null
        }
        pagination={{
          total: result.total,
          page: result.page,
          totalPages: result.totalPages,
          itemLabel: "draft",
          buildHref: (page) =>
            buildDraftsHref(
              basePath,
              page,
              pageParam,
              {
                branch: currentBranch,
                q: currentQ,
                sort: sort || undefined,
                dir: sort ? sortDir : undefined,
                limit: pageSize,
              },
              preserveParams,
            ),
        }}
      >
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <GlobalTableHead className="w-10">
              <Checkbox
                checked={
                  selection.isAllSelected ||
                  (selection.isPartiallySelected ? "indeterminate" : false)
                }
                onCheckedChange={(checked) => selection.toggleAll(checked === true)}
                aria-label="Select all draft orders"
              />
            </GlobalTableHead>
            <TableIndexHead />
            <GlobalTableHead
              sortKey="sap"
              activeSortKey={sort}
              sortDirection={sortDir}
              onSort={(key) => toggleSort(key as DraftSortField)}
            >
              SAP Code
            </GlobalTableHead>
            <GlobalTableHead
              sortKey="orderNumber"
              activeSortKey={sort}
              sortDirection={sortDir}
              onSort={(key) => toggleSort(key as DraftSortField)}
            >
              Order #
            </GlobalTableHead>
            <GlobalTableHead
              sortKey="branch"
              activeSortKey={sort}
              sortDirection={sortDir}
              onSort={(key) => toggleSort(key as DraftSortField)}
            >
              Branch
            </GlobalTableHead>
            <GlobalTableHead>Type</GlobalTableHead>
            <GlobalTableHead>Lines</GlobalTableHead>
            <GlobalTableHead
              sortKey="status"
              activeSortKey={sort}
              sortDirection={sortDir}
              onSort={(key) => toggleSort(key as DraftSortField)}
            >
              Status
            </GlobalTableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.items.map((o, index) => (
            <TableRow
              key={o.id}
              data-state={selection.isRowSelected(o.id) ? "selected" : undefined}
              className={cn(index % 2 === 1 && "bg-table-stripe")}
            >
              <TableCell>
                <Checkbox
                  checked={selection.isRowSelected(o.id)}
                  onCheckedChange={(checked) =>
                    selection.toggleRow(o.id, checked === true)
                  }
                  aria-label={`Select draft order ${o.orderNumber}`}
                />
              </TableCell>
              <TableIndexCell index={indexOffset + index + 1} />
              <TableCell className="font-mono text-sm">{o.branch.sapCode}</TableCell>
              <TableCell className="font-mono text-sm">
                <Link href="/orders" className="underline">
                  {o.orderNumber}
                </Link>
              </TableCell>
              <TableCell>{o.branch.name}</TableCell>
              <TableCell>
                <OrderTypeBadge orderType="auto_replenish" />
              </TableCell>
              <TableCell>
                {o.details.map((d) => `${d.model.skuCode}×${d.quantity}`).join(", ")}
              </TableCell>
              <TableCell>
                <OrderStatusBadge status={o.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </GlobalDataTable>
    </section>
  );
}
