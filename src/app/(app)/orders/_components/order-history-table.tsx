"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { TableAmountCell } from "@/components/data-table/table-amount-cell";
import {
  DEFAULT_TABLE_PAGE_SIZE,
  parseTablePageSize,
  type TablePageSize,
} from "@/components/data-table/table-page-size";
import { uniqueSearchSuggestions } from "@/components/data-table/table-search-bar";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import { OrderTypeBadge } from "@/features/orders/components/order-type-badge";
import { BRANCH_ORDER_STATUS_LABELS } from "@/features/orders/constants/order-status";
import type { OrderHistoryRow } from "@/features/orders/types/order-analytics";
import { GlobalDataTable, GlobalTableHead, nextTableSort } from "@/lib/data-table";
import {
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { matchesTableSearch } from "@/utils/match-table-search";
import type { BranchOrderStatus } from "@prisma/client";

type HistorySortField = "orderNumber" | "branch" | "orderType" | "status" | "createdAt";
type HistorySortDir = "asc" | "desc";

interface OrderHistoryTableProps {
  result: {
    items: OrderHistoryRow[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  basePath: string;
  initialSort?: string;
  initialSortDir?: string;
}

function buildHistoryHref(
  basePath: string,
  page: number,
  limit: number,
  sort?: string,
  sortDir?: string,
): string {
  const params = new URLSearchParams();
  params.set("tab", "history");
  if (page > 1) params.set("page", String(page));
  if (limit !== DEFAULT_TABLE_PAGE_SIZE) params.set("limit", String(limit));
  if (sort) params.set("sort", sort);
  if (sort && sortDir) params.set("dir", sortDir);
  return `${basePath}?${params.toString()}`;
}

function formatHistoryDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function OrderHistoryTable({
  result,
  basePath,
  initialSort = "createdAt",
  initialSortDir = "desc",
}: OrderHistoryTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const pageSize = parseTablePageSize(result.limit);
  const sort = (searchParams.get("sort") ?? initialSort) || "createdAt";
  const sortDir = (
    (searchParams.get("dir") ?? initialSortDir) === "asc" ? "asc" : "desc"
  ) as HistorySortDir;

  function handlePageSizeChange(limit: TablePageSize) {
    router.push(buildHistoryHref(basePath, 1, limit, sort, sort ? sortDir : undefined));
  }

  function toggleSort(field: HistorySortField) {
    const next = nextTableSort(field, sort, sortDir);
    router.push(buildHistoryHref(basePath, 1, pageSize, next.sort, next.dir));
  }

  const filtered = useMemo(
    () =>
      result.items.filter((row) =>
        matchesTableSearch(query, [
          row.orderNumber,
          row.branchName,
          row.status,
          row.lastUpdatedBy,
        ]),
      ),
    [result.items, query],
  );

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        result.items.map((row) => row.orderNumber),
        result.items.map((row) => row.branchName),
        result.items.map((row) => row.lastUpdatedBy),
      ),
    [result.items],
  );

  return (
    <GlobalDataTable
      stickyHeader
      search={{
        value: query,
        onChange: setQuery,
        placeholder: "Search history…",
        suggestions,
      }}
      pageSize={{ value: pageSize, onChange: handlePageSizeChange }}
      pagination={{
        total: result.total,
        page: result.page,
        totalPages: result.totalPages,
        itemLabel: "order",
        buildHref: (page) =>
          buildHistoryHref(basePath, page, pageSize, sort, sort ? sortDir : undefined),
      }}
    >
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <GlobalTableHead
            sortKey="orderNumber"
            activeSortKey={sort}
            sortDirection={sortDir}
            onSort={(key) => toggleSort(key as HistorySortField)}
          >
            SO#
          </GlobalTableHead>
          <GlobalTableHead
            sortKey="orderType"
            activeSortKey={sort}
            sortDirection={sortDir}
            onSort={(key) => toggleSort(key as HistorySortField)}
          >
            Type
          </GlobalTableHead>
          <GlobalTableHead
            sortKey="branch"
            activeSortKey={sort}
            sortDirection={sortDir}
            onSort={(key) => toggleSort(key as HistorySortField)}
          >
            Branch
          </GlobalTableHead>
          <GlobalTableHead>Order Qty</GlobalTableHead>
          <GlobalTableHead>Total Amt</GlobalTableHead>
          <GlobalTableHead>App Qty</GlobalTableHead>
          <GlobalTableHead>App Amt</GlobalTableHead>
          <GlobalTableHead
            sortKey="createdAt"
            activeSortKey={sort}
            sortDirection={sortDir}
            onSort={(key) => toggleSort(key as HistorySortField)}
          >
            Date
          </GlobalTableHead>
          <GlobalTableHead>Last updated by</GlobalTableHead>
          <GlobalTableHead
            sortKey="status"
            activeSortKey={sort}
            sortDirection={sortDir}
            onSort={(key) => toggleSort(key as HistorySortField)}
          >
            Status
          </GlobalTableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filtered.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-mono text-sm">{row.orderNumber}</TableCell>
            <TableCell>
              <OrderTypeBadge orderType={row.orderType} />
            </TableCell>
            <TableCell>{row.branchName}</TableCell>
            <TableCell className="tabular-nums">{row.orderQty}</TableCell>
            <TableAmountCell value={row.totalAmt} />
            <TableCell className="tabular-nums">{row.appQty}</TableCell>
            <TableAmountCell value={row.appAmt} />
            <TableCell>
              <p>{formatHistoryDate(row.createdAt)}</p>
              <p className="text-xs text-muted-foreground">
                Updated {formatHistoryDate(row.updatedAt)}
              </p>
            </TableCell>
            <TableCell>{row.lastUpdatedBy}</TableCell>
            <TableCell>
              <StatusCodeBadge
                code={row.status}
                name={
                  BRANCH_ORDER_STATUS_LABELS[row.status as BranchOrderStatus] ??
                  row.status
                }
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </GlobalDataTable>
  );
}
