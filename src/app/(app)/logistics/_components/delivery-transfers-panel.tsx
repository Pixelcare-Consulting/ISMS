"use client";

import { createColumnHelper } from "@tanstack/react-table";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { DeliveryTransferStatusBadge } from "@/app/(app)/logistics/_components/delivery-transfer-status-badge";
import { transfersListHref } from "@/features/logistics/constants/transfers-page-tabs";
import { DELIVERY_TRANSFER_STATUS_LABELS } from "@/features/logistics/constants/delivery-workflow-labels";
import type { DeliveryTransferListRow } from "@/features/logistics/services/delivery-transfer.service";
import { parseTablePageSize, type TablePageSize } from "@/components/data-table/table-page-size";
import { DataTable, type DataTableColumn, type DataTableFeatures } from "@/lib/data-table";
import { matchesTableSearch } from "@/utils/match-table-search";

interface PaginatedList<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const column = createColumnHelper<DataTableFeatures, DeliveryTransferListRow>();

const dateFormat = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" });

export function DeliveryTransfersPanel({ transfers }: { transfers: PaginatedList<DeliveryTransferListRow> }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const pageSize = parseTablePageSize(transfers.limit);

  const filtered = useMemo(
    () =>
      transfers.items.filter((row) =>
        matchesTableSearch(query, [
          row.transferNo,
          row.deliveryNo,
          row.releaseName,
          row.receiveName,
          DELIVERY_TRANSFER_STATUS_LABELS[row.status],
        ]),
      ),
    [transfers.items, query],
  );

  const indexOffset = (transfers.page - 1) * transfers.limit;
  const columns = useMemo<DataTableColumn<DeliveryTransferListRow>[]>(
    () => [
      column.display({
        id: "index",
        header: "#",
        cell: ({ row }) => indexOffset + row.index + 1,
        meta: { className: "text-center tabular-nums text-muted-foreground" },
      }),
      column.accessor((row) => row.transferNo, {
        id: "transferNo",
        header: "Transfer No",
        cell: ({ row }) => (
          <Link
            href={`/logistics/delivery-transfers/${row.original.id}`}
            className="rounded-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {row.original.transferNo}
          </Link>
        ),
      }),
      column.accessor((row) => row.deliveryNo, { id: "deliveryNo", header: "Delivery" }),
      column.accessor((row) => row.releaseName, { id: "release", header: "Branch release" }),
      column.accessor((row) => row.receiveName, { id: "receive", header: "Branch receive" }),
      column.accessor((row) => row.unitCount, {
        id: "units",
        header: "Units",
        meta: { className: "tabular-nums" },
      }),
      column.display({
        id: "status",
        header: "Transfer status",
        cell: ({ row }) => <DeliveryTransferStatusBadge status={row.original.status} />,
      }),
      column.display({
        id: "sap",
        header: "SAP IT",
        cell: ({ row }) =>
          row.original.sapDocNo ? (
            <span className="tabular-nums">{row.original.sapDocNo}</span>
          ) : row.original.sapError ? (
            <span className="text-destructive">Failed</span>
          ) : (
            <span className="text-muted-foreground">None</span>
          ),
      }),
      column.accessor((row) => row.createdAt, {
        id: "createdAt",
        header: "Created",
        cell: ({ row }) => dateFormat.format(new Date(row.original.createdAt)),
      }),
    ],
    [indexOffset],
  );

  return (
    <DataTable
      data={filtered}
      columns={columns}
      getRowId={(row) => row.id}
      manualPagination
      stickyHeader
      search={{ value: query, onChange: setQuery, placeholder: "Search unit transfers…" }}
      pagination={{
        total: transfers.total,
        page: transfers.page,
        totalPages: transfers.totalPages,
        itemLabel: "unit transfer",
        buildHref: (page) => transfersListHref("unit", page, pageSize),
      }}
      pageSize={{
        value: pageSize,
        onChange: (limit: TablePageSize) =>
          router.push(transfersListHref("unit", 1, limit)),
      }}
      empty={filtered.length === 0}
      emptyMessage={
        query.trim()
          ? "No results match your search."
          : "No unit transfers yet. Create one from a delivery's receive dialog."
      }
    />
  );
}
