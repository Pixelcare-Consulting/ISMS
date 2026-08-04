"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import {
  TableIndexCell,
  TableIndexHead,
  TableRowCheckbox,
  TableSelectAllCheckbox,
  TableSelectionBadge,
  uniqueSearchSuggestions,
  useTableSelection,
} from "@/components/data-table";
import { Button } from "@/components/ui/button";
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
  branch: { id: string; name: string };
  details: { quantity: number; model: { skuCode: string; name: string } }[];
}

interface DraftFilters {
  branch?: string;
  q?: string;
  sort?: string;
  dir?: string;
}

type DraftSortField = "orderNumber" | "branch" | "status";
type DraftSortDir = "asc" | "desc";

interface DraftSuggestedOrdersTableProps {
  basePath: string;
  pageParam?: string;
  result: {
    items: DraftOrderRow[];
    total: number;
    page: number;
    totalPages: number;
    limit?: number;
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

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        result.items.map((item) => item.orderNumber),
        result.items.map((item) => item.branch.name),
        result.items.flatMap((item) =>
          item.details.flatMap((detail) => [detail.model.skuCode, detail.model.name]),
        ),
      ),
    [result.items],
  );

  const hasActiveFilters = Boolean(currentBranch || currentQ);
  const indexOffset = (result.page - 1) * (result.limit ?? 25);

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
        },
        preserveParams,
      ),
    );
  }

  function clearFilters() {
    setBranch("");
    setQ("");
    router.push(buildDraftsHref(basePath, 1, pageParam, {}, preserveParams));
  }

  function toggleSort(field: DraftSortField) {
    const next = nextTableSort(field, sort, sortDir);
    router.push(
      buildDraftsHref(
        basePath,
        1,
        pageParam,
        { branch: currentBranch, q: currentQ, sort: next.sort, dir: next.dir },
        preserveParams,
      ),
    );
  }

  return (
    <section className="space-y-2">
      <GlobalDataTable
        stickyHeader
        toolbarLeading={
          <>
            <span className="text-sm font-medium">Draft auto-replenish orders</span>
            <TableSelectionBadge
              count={selection.selectedCount}
              onClear={selection.clearSelection}
              size="sm"
            />
            <SearchableSelect
              label="Branch"
              id="drafts-branch"
              options={[
                { id: "all", label: "All branches" },
                ...branches.map((b) => ({ id: b.id, label: b.name })),
              ]}
              value={branch || "all"}
              onChange={(value) => setBranch(value === "all" ? "" : value)}
              searchPlaceholder="Search branches…"
            />
          </>
        }
        search={{
          value: q,
          onChange: setQ,
          placeholder: "Order #, branch, SKU…",
          suggestions,
        }}
        toolbarActions={
          <>
            <Button type="button" size="sm" onClick={applyFilters}>
              Apply
            </Button>
            {hasActiveFilters ? (
              <Button type="button" size="sm" variant="outline" onClick={clearFilters}>
                Clear
              </Button>
            ) : null}
          </>
        }
        empty={result.items.length === 0}
        emptyMessage="No draft suggested orders. Run allocation then generate."
        banner={
          hasActiveFilters ? (
            <p className="border-b px-4 py-2 text-xs text-muted-foreground">
              Filtered results.
              <Button variant="link" className="ml-1 h-auto p-0 text-xs" asChild>
                <Link href={buildDraftsHref(basePath, 1, pageParam, {}, preserveParams)}>
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
              { branch: currentBranch, q: currentQ, sort: sort || undefined, dir: sort ? sortDir : undefined },
              preserveParams,
            ),
        }}
      >
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableSelectAllCheckbox
              isAllSelected={selection.isAllSelected}
              isPartiallySelected={selection.isPartiallySelected}
              onToggleAll={selection.toggleAll}
              aria-label="Select all draft orders"
            />
            <TableIndexHead />
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
              <TableRowCheckbox
                checked={selection.isRowSelected(o.id)}
                onCheckedChange={(checked) => selection.toggleRow(o.id, checked)}
                aria-label={`Select draft order ${o.orderNumber}`}
              />
              <TableIndexCell index={indexOffset + index + 1} />
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
