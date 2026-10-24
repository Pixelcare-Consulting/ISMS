"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { useMemo, useState } from "react";

import { LogisticsTableHeading } from "@/app/(app)/logistics/_components/logistics-detail-ui";
import { uniqueSearchSuggestions, useClientTablePagination } from "@/components/data-table";
import type { OrderHistoryDetailLine } from "@/features/orders/types/order-analytics";
import {
  DataTable,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
import { formatPeso } from "@/utils/format-currency";
import { matchesTableSearch } from "@/utils/match-table-search";

const lineColumn = createColumnHelper<DataTableFeatures, OrderHistoryDetailLine>();

function textOrDash(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "—";
}

function lineColumns(): DataTableColumn<OrderHistoryDetailLine>[] {
  return [
    lineColumn.display({
      id: "sku",
      header: "SKU",
      cell: ({ row }) => row.original.skuCode,
      meta: { className: "font-mono" },
    }),
    lineColumn.display({
      id: "model",
      header: "Model",
      cell: ({ row }) => textOrDash(row.original.name),
    }),
    lineColumn.display({
      id: "orderQty",
      header: "Order qty",
      cell: ({ row }) => row.original.quantity,
      meta: { align: "end" },
    }),
    lineColumn.display({
      id: "amount",
      header: "Amount",
      cell: ({ row }) => formatPeso(row.original.amount),
      meta: { align: "end", className: "font-mono" },
    }),
    lineColumn.display({
      id: "approvedQty",
      header: "Approved qty",
      cell: ({ row }) => (row.original.approvedQty == null ? "—" : row.original.approvedQty),
      meta: { align: "end" },
    }),
    lineColumn.display({
      id: "approvedAmount",
      header: "Approved amount",
      cell: ({ row }) =>
        row.original.approvedAmount == null ? "—" : formatPeso(row.original.approvedAmount),
      meta: { align: "end", className: "font-mono" },
    }),
    lineColumn.display({
      id: "note",
      header: "Note",
      cell: ({ row }) => (
        <span className="whitespace-pre-wrap">{textOrDash(row.original.remarks)}</span>
      ),
      meta: { wrap: true },
    }),
    lineColumn.display({
      id: "spNote",
      header: "SP note",
      cell: ({ row }) => (
        <span className="whitespace-pre-wrap">{textOrDash(row.original.spRemarks)}</span>
      ),
      meta: { wrap: true },
    }),
  ];
}

export function OrderHistoryLinesTable({ lines }: { lines: OrderHistoryDetailLine[] }) {
  const [query, setQuery] = useState("");
  const columns = useMemo(() => lineColumns(), []);
  const filtered = useMemo(
    () =>
      lines.filter((line) =>
        matchesTableSearch(query, [
          line.skuCode,
          line.name,
          line.remarks,
          line.spRemarks,
          String(line.quantity),
          String(line.amount),
          line.approvedQty == null ? "" : String(line.approvedQty),
          line.approvedAmount == null ? "" : String(line.approvedAmount),
        ]),
      ),
    [lines, query],
  );
  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        lines.map((line) => line.skuCode),
        lines.map((line) => line.name),
      ),
    [lines],
  );
  const { page, setPage, pageSize, setPageSize, total, totalPages, pageItems } =
    useClientTablePagination(filtered, { resetKey: query });

  return (
    <DataTable
      data={pageItems}
      columns={columns}
      getRowId={(row) => row.detailId}
      manualPagination
      stickyHeader
      search={{
        value: query,
        onChange: setQuery,
        placeholder: "Search lines…",
        suggestions,
      }}
      pageSize={{ value: pageSize, onChange: setPageSize }}
      toolbarLeading={<LogisticsTableHeading title="Lines" count={lines.length} itemLabel="line" />}
      pagination={{
        total,
        page,
        totalPages,
        itemLabel: "line",
        onPageChange: setPage,
      }}
      empty={pageItems.length === 0}
      emptyMessage={lines.length === 0 ? "No lines." : "No matching lines."}
    />
  );
}
