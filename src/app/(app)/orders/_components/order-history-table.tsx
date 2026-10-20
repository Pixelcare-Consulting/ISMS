"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { OrderDetailsDialog } from "@/app/(app)/orders/_components/order-details-dialog";
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
import {
  DataTable,
  nextTableSort,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
import { Button } from "@/components/ui/button";
import { formatPeso } from "@/utils/format-currency";
import { matchesTableSearch } from "@/utils/match-table-search";
import type { BranchOrderStatus } from "@prisma/client";

const historyColumn = createColumnHelper<DataTableFeatures, OrderHistoryRow>();

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
  viewerRoleSlugs?: string[];
  hasCreatePermission?: boolean;
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
  viewerRoleSlugs = [],
  hasCreatePermission = false,
  initialSort = "createdAt",
  initialSortDir = "desc",
}: OrderHistoryTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [detailsRow, setDetailsRow] = useState<OrderHistoryRow | null>(null);
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

  const columns = useMemo(() => {
    const cols: DataTableColumn<OrderHistoryRow>[] = [
      historyColumn.accessor((row) => row.orderNumber, {
        id: "orderNumber",
        header: "SO#",
        enableSorting: true,
        meta: { className: "font-mono" },
      }),
      historyColumn.display({
        id: "orderType",
        header: "Type",
        enableSorting: true,
        cell: ({ row }) => <OrderTypeBadge orderType={row.original.orderType} />,
      }),
      historyColumn.accessor((row) => row.branchName, {
        id: "branch",
        header: "Branch",
        enableSorting: true,
      }),
      historyColumn.accessor((row) => row.orderQty, {
        id: "orderQty",
        header: "Order Qty",
        enableSorting: false,
        meta: { className: "tabular-nums" },
      }),
      historyColumn.display({
        id: "totalAmt",
        header: "Total Amt",
        enableSorting: false,
        cell: ({ row }) => formatPeso(row.original.totalAmt),
        meta: { align: "end", className: "font-mono" },
      }),
      historyColumn.accessor((row) => row.appQty, {
        id: "appQty",
        header: "App Qty",
        enableSorting: false,
        meta: { className: "tabular-nums" },
      }),
      historyColumn.display({
        id: "appAmt",
        header: "App Amt",
        enableSorting: false,
        cell: ({ row }) => formatPeso(row.original.appAmt),
        meta: { align: "end", className: "font-mono" },
      }),
      historyColumn.display({
        id: "createdAt",
        header: "Date",
        enableSorting: true,
        cell: ({ row }) => (
          <div>
            <p>{formatHistoryDate(row.original.createdAt)}</p>
            <p className="text-xs text-muted-foreground">
              Updated {formatHistoryDate(row.original.updatedAt)}
            </p>
          </div>
        ),
      }),
      historyColumn.accessor((row) => row.lastUpdatedBy, {
        id: "lastUpdatedBy",
        header: "Last updated by",
        enableSorting: false,
      }),
      historyColumn.display({
        id: "status",
        header: "Status",
        enableSorting: true,
        cell: ({ row }) => (
          <StatusCodeBadge
            code={row.original.status}
            name={
              BRANCH_ORDER_STATUS_LABELS[row.original.status as BranchOrderStatus] ??
              row.original.status
            }
          />
        ),
      }),
      historyColumn.display({
        id: "view",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <Button type="button" size="sm" variant="outline" onClick={() => setDetailsRow(row.original)}>
            View
          </Button>
        ),
        meta: { align: "end" },
      }),
    ];
    return cols;
  }, []);

  return (
    <>
      <DataTable
        data={filtered}
        columns={columns}
        getRowId={(row) => row.id}
        manualSorting
        manualPagination
        enableSorting
        sorting={{
          sortKey: sort,
          sortDir,
          onSort: (columnId) => toggleSort(columnId as HistorySortField),
        }}
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
        empty={filtered.length === 0}
        emptyMessage={query.trim() ? "No results match your search." : "No order history."}
      />
      {detailsRow ? (
        <OrderDetailsDialog
          orderId={detailsRow.id}
          orderNumber={detailsRow.orderNumber}
          orderType={detailsRow.orderType}
          branchId={detailsRow.branchId}
          branchName={detailsRow.branchName}
          status={detailsRow.status as BranchOrderStatus}
          notes={detailsRow.notes}
          deliveryDueDate={detailsRow.deliveryDueDate}
          createdByName={detailsRow.createdByName}
          reviewSnapshot={detailsRow.reviewSnapshot}
          reviewSnapshotAt={detailsRow.reviewSnapshotAt}
          lines={detailsRow.lines.map((line) => ({
            detailId: line.detailId,
            modelId: line.modelId,
            skuCode: line.skuCode,
            name: line.name,
            quantity: line.quantity,
            approvedQty: line.approvedQty,
            remarks: line.remarks,
            spRemarks: line.spRemarks,
          }))}
          approvalLevels={detailsRow.approvalLevels}
          roleSlugs={viewerRoleSlugs}
          hasCreatePermission={hasCreatePermission}
          open
          onOpenChange={(open) => {
            if (!open) setDetailsRow(null);
          }}
        />
      ) : null}
    </>
  );
}
