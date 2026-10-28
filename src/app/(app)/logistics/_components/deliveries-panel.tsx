"use client";

import { createColumnHelper } from "@tanstack/react-table";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { formatInventoryDrDate } from "@/app/(app)/inventory/_components/inventory-list-format";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import {
  parseTablePageSize,
  type TablePageSize,
} from "@/components/data-table/table-page-size";
import { uniqueSearchSuggestions } from "@/components/data-table/table-search-bar";
import {
  DataTable,
  nextTableSort,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
import { Button } from "@/components/ui/button";
import {
  DeliveryReturnCell,
  type LatestDeliveryReturn,
} from "@/app/(app)/logistics/_components/delivery-return-dialogs";
import {
  buildLogisticsPageHref,
  LOGISTICS_DELIVERIES_PATH,
} from "@/app/(app)/logistics/_components/logistics-paths";
import { CheckSapNowButton } from "@/app/(app)/logistics/_components/check-sap-now-button";
import { CompactProgressRail } from "@/app/(app)/logistics/_components/compact-progress-rail";
import { buildDeliveryTracker } from "@/app/(app)/logistics/_components/delivery-tracker";
import type { WorkflowStatusOption } from "@/features/logistics/constants/workflow-codes";
import {
  LogisticsListViewSwitch,
  useLogisticsListProgressView,
} from "@/app/(app)/logistics/_components/logistics-list-view-switch";
import { matchesTableSearch } from "@/utils/match-table-search";

interface StatusCodeRef {
  id: string;
  code: string;
  name: string;
  color?: string | null;
}

interface PaginatedList<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface DeliveryRow {
  id: string;
  deliveryNo: string;
  drNo: string | null;
  drDate: Date | string | null;
  statusCode: StatusCodeRef;
  branch: { name: string };
  order: { orderNumber: string } | null;
  /** Latest return request, newest first (at most one). */
  returnRequests: LatestDeliveryReturn[];
}

interface DeliveriesPanelProps {
  deliveries: PaginatedList<DeliveryRow>;
  workflowStatuses: readonly WorkflowStatusOption[];
  /** Shows "Check SAP now" (dispatch or logistics manage permission). */
  canCheckSap?: boolean;
  initialSort?: string;
  initialSortDir?: string;
}

const deliveryColumn = createColumnHelper<DataTableFeatures, DeliveryRow>();

type DeliverySortField = "deliveryNo" | "orderNumber" | "branch" | "status";
type DeliverySortDir = "asc" | "desc";

export function DeliveriesPanel({
  deliveries,
  workflowStatuses,
  canCheckSap = false,
  initialSort = "",
  initialSortDir = "desc",
}: DeliveriesPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [progressView] = useLogisticsListProgressView();
  const [query, setQuery] = useState("");
  const pageSize = parseTablePageSize(deliveries.limit);
  const sort = (searchParams.get("sort") ?? initialSort) || "";
  const sortDir = (
    (searchParams.get("dir") ?? initialSortDir) === "asc" ? "asc" : "desc"
  ) as DeliverySortDir;

  function handlePageSizeChange(limit: TablePageSize) {
    router.push(
      buildLogisticsPageHref(LOGISTICS_DELIVERIES_PATH, 1, limit, sort, sort ? sortDir : undefined),
    );
  }

  function toggleSort(field: DeliverySortField) {
    const next = nextTableSort(field, sort, sortDir);
    router.push(
      buildLogisticsPageHref(LOGISTICS_DELIVERIES_PATH, 1, pageSize, next.sort, next.dir),
    );
  }

  const filtered = useMemo(
    () =>
      deliveries.items.filter((d) =>
        matchesTableSearch(query, [
          d.deliveryNo,
          d.drNo,
          d.branch.name,
          d.order?.orderNumber,
          d.statusCode.name,
          d.statusCode.code,
        ]),
      ),
    [deliveries.items, query],
  );

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        deliveries.items.map((d) => d.deliveryNo),
        deliveries.items.map((d) => d.drNo),
        deliveries.items.map((d) => d.branch.name),
        deliveries.items.map((d) => d.order?.orderNumber),
        deliveries.items.map((d) => d.statusCode.name),
        deliveries.items.map((d) => d.statusCode.code),
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
            href={`/logistics/deliveries/${row.original.id}`}
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
            items={buildDeliveryTracker(
              {
                code: row.original.statusCode.code,
                name: row.original.statusCode.name,
                color: row.original.statusCode.color ?? null,
              },
              [],
              workflowStatuses,
            )}
          />
        ),
        meta: { className: "w-52 min-w-52" },
      }),
      deliveryColumn.accessor((row) => row.drNo ?? "", {
        id: "drNo",
        header: "DR#",
        enableSorting: false,
        cell: ({ row }) => row.original.drNo ?? "—",
      }),
      deliveryColumn.accessor((row) => row.drDate ?? "", {
        id: "drDate",
        header: "DR date",
        enableSorting: false,
        cell: ({ row }) => formatInventoryDrDate(row.original.drDate),
      }),
      deliveryColumn.accessor((row) => row.order?.orderNumber ?? "", {
        id: "orderNumber",
        header: "Order",
        enableSorting: true,
        cell: ({ row }) => row.original.order?.orderNumber ?? "—",
      }),
      deliveryColumn.accessor((row) => row.branch.name, {
        id: "branch",
        header: "Branch",
        enableSorting: true,
      }),
      deliveryColumn.display({
        id: "status",
        header: "Status",
        enableSorting: true,
        cell: ({ row }) => (
          <StatusCodeBadge
            code={row.original.statusCode.code}
            name={row.original.statusCode.name}
            color={row.original.statusCode.color}
          />
        ),
      }),
      deliveryColumn.display({
        id: "return",
        header: "Return",
        enableSorting: false,
        cell: ({ row }) => <DeliveryReturnCell latest={row.original.returnRequests[0]} />,
      }),
      deliveryColumn.display({
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => (
          <Button size="sm" variant="outline" asChild>
            <Link href={`/logistics/deliveries/${row.original.id}`}>Open</Link>
          </Button>
        ),
      }),
    ];
    if (!progressView) return cols.filter((column) => column.id !== "progress");
    const progressIds = new Set([
      "deliveryNo",
      "progress",
      "orderNumber",
      "branch",
      "status",
      "return",
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
        onSort: (columnId) => toggleSort(columnId as DeliverySortField),
      }}
      stickyHeader
      search={{ value: query, onChange: setQuery, placeholder: "Search deliveries…", suggestions }}
      toolbarActions={
        <>
          {canCheckSap ? <CheckSapNowButton /> : null}
          <LogisticsListViewSwitch />
        </>
      }
      pagination={{
        total: deliveries.total,
        page: deliveries.page,
        totalPages: deliveries.totalPages,
        itemLabel: "delivery",
        buildHref: (page) =>
          buildLogisticsPageHref(
            LOGISTICS_DELIVERIES_PATH,
            page,
            pageSize,
            sort,
            sort ? sortDir : undefined,
          ),
      }}
      pageSize={{ value: pageSize, onChange: handlePageSizeChange }}
      empty={filtered.length === 0}
      emptyMessage={query.trim() ? "No results match your search." : "No deliveries."}
    />
  );
}
