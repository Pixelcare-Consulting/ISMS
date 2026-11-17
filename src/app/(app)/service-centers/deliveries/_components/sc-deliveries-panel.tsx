"use client";

import { createColumnHelper } from "@tanstack/react-table";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { formatInventoryDrDate } from "@/app/(app)/inventory/_components/inventory-list-format";
import { CompactProgressRail } from "@/app/(app)/logistics/_components/compact-progress-rail";
import { buildDeliveryTracker } from "@/app/(app)/logistics/_components/delivery-tracker";
import { DrNoText } from "@/app/(app)/logistics/_components/dr-no-text";
import {
  LogisticsListViewSwitch,
  useLogisticsListProgressView,
} from "@/app/(app)/logistics/_components/logistics-list-view-switch";
import { buildLogisticsPageHref } from "@/app/(app)/logistics/_components/logistics-paths";
import { ScCheckSapNowButton } from "@/app/(app)/service-centers/deliveries/_components/sc-check-sap-now-button";
import {
  parseTablePageSize,
  type TablePageSize,
} from "@/components/data-table/table-page-size";
import { uniqueSearchSuggestions } from "@/components/data-table/table-search-bar";
import { Button } from "@/components/ui/button";
import type { WorkflowStatusOption } from "@/features/logistics/constants/workflow-codes";
import { DR_DATE_LABEL, DR_NO_LABEL } from "@/features/logistics/lib/sap-doc-number";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import type { listScDeliveriesAction } from "@/features/service-center-ops/actions/sc-logistics.actions";
import type { ScDeliveryListSort } from "@/features/service-center-ops/repositories/sc-ops.repository";
import {
  DataTable,
  nextTableSort,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
import { matchesTableSearch } from "@/utils/match-table-search";

type DeliveryList = Awaited<ReturnType<typeof listScDeliveriesAction>>;
type DeliveryRow = DeliveryList["items"][number];

export const SC_DELIVERIES_PATH = "/service-centers/deliveries";

const deliveryColumn = createColumnHelper<DataTableFeatures, DeliveryRow>();

/** A delivery without a status code reads as Pending, the status Check SAP gives new ones. */
function rowStatus(row: DeliveryRow) {
  return {
    code: row.statusCode?.code ?? "pending",
    name: row.statusCode?.name ?? "Pending",
    color: row.statusCode?.color ?? null,
  };
}

function receivedLabel(row: DeliveryRow): string {
  if (row.lines.length === 0) return "—";
  const received = row.lines.filter((line) => line.acceptedAt !== null).length;
  return `${received} / ${row.lines.length}`;
}

export function ScDeliveriesPanel({
  deliveries,
  workflowStatuses,
  canCheckSap,
  initialSort = "",
  initialSortDir = "desc",
}: {
  deliveries: DeliveryList;
  workflowStatuses: readonly WorkflowStatusOption[];
  canCheckSap: boolean;
  initialSort?: string;
  initialSortDir?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [progressView] = useLogisticsListProgressView();
  const [query, setQuery] = useState("");
  const pageSize = parseTablePageSize(deliveries.limit);
  const sort = (searchParams.get("sort") ?? initialSort) || "";
  const sortDir = (searchParams.get("dir") ?? initialSortDir) === "asc" ? "asc" : "desc";

  function hrefFor(page: number, limit: number = pageSize, nextSort = sort, nextDir = sortDir) {
    return buildLogisticsPageHref(
      SC_DELIVERIES_PATH,
      page,
      limit,
      nextSort,
      nextSort ? nextDir : undefined,
    );
  }

  function toggleSort(field: ScDeliveryListSort) {
    const next = nextTableSort(field, sort, sortDir);
    router.push(hrefFor(1, pageSize, next.sort, next.dir));
  }

  const filtered = useMemo(
    () =>
      deliveries.items.filter((row) =>
        matchesTableSearch(query, [
          row.deliveryNo,
          row.sapDocNo,
          row.serviceCenter.name,
          row.order?.orderNumber,
          row.statusCode?.name,
          row.statusCode?.code,
        ]),
      ),
    [deliveries.items, query],
  );

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        deliveries.items.map((row) => row.deliveryNo),
        deliveries.items.map((row) => row.sapDocNo),
        deliveries.items.map((row) => row.serviceCenter.name),
        deliveries.items.map((row) => row.order?.orderNumber),
        deliveries.items.map((row) => row.statusCode?.name),
      ),
    [deliveries.items],
  );

  const indexOffset = (deliveries.page - 1) * deliveries.limit;
  const columns = useMemo(() => {
    const cols: DataTableColumn<DeliveryRow>[] = [
      deliveryColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => indexOffset + row.index + 1,
        meta: { className: "text-center tabular-nums text-muted-foreground" },
      }),
      deliveryColumn.accessor((row) => row.deliveryNo, {
        id: "deliveryNo",
        header: "No.",
        enableSorting: true,
        cell: ({ row }) => (
          <Link
            href={`${SC_DELIVERIES_PATH}/${row.original.id}`}
            className="font-medium hover:underline"
          >
            {row.original.deliveryNo}
          </Link>
        ),
      }),
      deliveryColumn.display({
        id: "progress",
        header: "Progress",
        enableSorting: false,
        cell: ({ row }) => (
          <CompactProgressRail
            ariaLabel={`${row.original.deliveryNo} progress`}
            items={buildDeliveryTracker(rowStatus(row.original), [], workflowStatuses)}
          />
        ),
        meta: { className: "w-52 min-w-52" },
      }),
      deliveryColumn.accessor((row) => row.sapDocNo ?? "", {
        id: "drNo",
        header: DR_NO_LABEL,
        enableSorting: false,
        cell: ({ row }) => <DrNoText value={row.original.sapDocNo} />,
      }),
      deliveryColumn.accessor((row) => row.sapDocDate ?? "", {
        id: "drDate",
        header: DR_DATE_LABEL,
        enableSorting: false,
        cell: ({ row }) => formatInventoryDrDate(row.original.sapDocDate),
      }),
      deliveryColumn.accessor((row) => row.order?.orderNumber ?? "", {
        id: "orderNumber",
        header: "Order",
        enableSorting: true,
        cell: ({ row }) => row.original.order?.orderNumber ?? "—",
      }),
      deliveryColumn.accessor((row) => row.serviceCenter.name, {
        id: "serviceCenter",
        header: "Service center",
        enableSorting: true,
      }),
      deliveryColumn.display({
        id: "status",
        header: "Status",
        enableSorting: true,
        cell: ({ row }) => {
          const status = rowStatus(row.original);
          return <StatusCodeBadge code={status.code} name={status.name} color={status.color} />;
        },
      }),
      deliveryColumn.display({
        id: "received",
        header: "Received",
        enableSorting: false,
        cell: ({ row }) => receivedLabel(row.original),
        meta: { className: "tabular-nums" },
      }),
      deliveryColumn.display({
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => (
          <Button size="sm" variant="outline" asChild>
            <Link href={`${SC_DELIVERIES_PATH}/${row.original.id}`}>Open</Link>
          </Button>
        ),
      }),
    ];
    if (!progressView) return cols.filter((column) => column.id !== "progress");
    const progressIds = new Set([
      "deliveryNo",
      "progress",
      "orderNumber",
      "serviceCenter",
      "status",
      "actions",
    ]);
    return cols.filter((column) => column.id != null && progressIds.has(column.id));
  }, [indexOffset, progressView, workflowStatuses]);

  return (
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
        onSort: (columnId) => toggleSort(columnId as ScDeliveryListSort),
      }}
      stickyHeader
      search={{ value: query, onChange: setQuery, placeholder: "Search deliveries…", suggestions }}
      toolbarActions={
        <>
          {canCheckSap ? <ScCheckSapNowButton /> : null}
          <LogisticsListViewSwitch />
        </>
      }
      pagination={{
        total: deliveries.total,
        page: deliveries.page,
        totalPages: deliveries.totalPages,
        itemLabel: "delivery",
        buildHref: (page) => hrefFor(page),
      }}
      pageSize={{
        value: pageSize,
        onChange: (limit: TablePageSize) => router.push(hrefFor(1, limit)),
      }}
      empty={filtered.length === 0}
      emptyMessage={
        query.trim()
          ? "No results match your search."
          : "No service center deliveries yet. Check SAP now adds the DRs SAP copied from approved SC orders."
      }
    />
  );
}
