"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { listScCentersForOpsAction } from "@/features/service-center-ops/actions/sc-inventory.actions";
import { createScDeliveryFromOrderAction } from "@/features/service-center-ops/actions/sc-logistics.actions";
import {
  approveScOrderAction,
  listScOrdersAction,
  rejectScOrderAction,
} from "@/features/service-center-ops/actions/sc-orders.actions";
import { useClientTablePagination } from "@/components/data-table";
import {
  DataTable,
  useClientTableSort,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { matchesTableSearch } from "@/utils/match-table-search";

type OrderRow = Awaited<ReturnType<typeof listScOrdersAction>>["items"][number];
type CenterOption = Awaited<ReturnType<typeof listScCentersForOpsAction>>[number];

const orderColumn = createColumnHelper<DataTableFeatures, OrderRow>();

/** Service-center orders are created on the shared Create Order page. */
const NEW_SC_ORDER_HREF = "/orders/manual/new?for=service_center";

export function ScOrdersPanel({
  items,
  centers,
  canCreate,
  canApprove,
  canCreateDelivery,
}: {
  items: OrderRow[];
  centers: CenterOption[];
  canCreate: boolean;
  canApprove: boolean;
  canCreateDelivery: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const filtered = useMemo(
    () =>
      items.filter((row) =>
        matchesTableSearch(query, [
          row.orderNumber,
          row.serviceCenter.name,
          row.status,
          row.poNumber ?? "",
          row.sapDocNum != null ? String(row.sapDocNum) : "",
        ]),
      ),
    [items, query],
  );

  const sort = useClientTableSort(filtered, {
    order: (row) => row.orderNumber,
    center: (row) => row.serviceCenter.name,
    status: (row) => row.status,
  });
  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    total,
    totalPages,
    pageItems,
    indexOffset,
  } = useClientTablePagination(sort.sorted, {
    resetKey: `${query}:${sort.sortKey}:${sort.sortDir}`,
  });

  function run<T extends { error?: string; success?: true }>(
    action: () => Promise<T>,
    ok: string | ((result: T) => string),
  ) {
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(typeof ok === "function" ? ok(result) : ok);
      router.refresh();
    });
  }

  const columns = useMemo(() => {
    const cols: DataTableColumn<OrderRow>[] = [
      orderColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => indexOffset + row.index + 1,
        meta: { className: "text-center tabular-nums text-muted-foreground" },
      }),
      orderColumn.accessor((row) => row.orderNumber, {
        id: "order",
        header: "Order",
        enableSorting: true,
        meta: { className: "font-medium" },
      }),
      orderColumn.accessor((row) => row.serviceCenter.name, {
        id: "center",
        header: "Center",
        enableSorting: true,
      }),
      orderColumn.display({
        id: "customer",
        header: "Customer",
        enableSorting: false,
        cell: ({ row }) => row.original.sapCardCode ?? "—",
      }),
      orderColumn.display({
        id: "po",
        header: "PO / Project",
        enableSorting: false,
        cell: ({ row }) =>
          [row.original.poNumber, row.original.projectCode].filter(Boolean).join(" · ") || "—",
      }),
      orderColumn.display({
        id: "so",
        header: "SO no.",
        enableSorting: false,
        cell: ({ row }) => row.original.sapDocNum ?? "—",
        meta: { className: "tabular-nums" },
      }),
      orderColumn.display({
        id: "lines",
        header: "Lines",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.details
            .map((detail) => `${detail.model.skuCode} × ${detail.quantity}`)
            .join(", "),
      }),
      orderColumn.display({
        id: "status",
        header: "Status",
        enableSorting: true,
        cell: ({ row }) => <Badge variant="secondary">{row.original.status}</Badge>,
      }),
      orderColumn.display({
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => {
          const order = row.original;
          return (
            <div className="flex flex-col gap-1">
              {canApprove && ["pending_tl", "pending_sp"].includes(order.status) ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => approveScOrderAction(order.id),
                        (result) =>
                          "sapDocNum" in result && result.sapDocNum != null
                            ? `Approved. SO ${result.sapDocNum} created in SAP`
                            : "Order approved and posted to SAP",
                      )
                    }
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => run(() => rejectScOrderAction(order.id), "Order rejected")}
                  >
                    Reject
                  </Button>
                </>
              ) : null}
              {canCreateDelivery &&
              order.status === "approved" &&
              order._count.deliveries === 0 ? (
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(() => createScDeliveryFromOrderAction(order.id), "Delivery created")
                  }
                >
                  Create delivery
                </Button>
              ) : null}
            </div>
          );
        },
      }),
    ];
    return cols;
  }, [canApprove, canCreateDelivery, indexOffset, pending]);

  return (
    <div className="space-y-4">
      <DataTable
        data={pageItems}
        columns={columns}
        getRowId={(row) => row.id}
        manualSorting
        manualPagination
        enableSorting
        sorting={{
          sortKey: sort.sortKey,
          sortDir: sort.sortDir,
          onSort: sort.toggleSort,
        }}
        stickyHeader
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search order, center, PO or SO…",
        }}
        toolbarActions={
          canCreate ? (
            <Button
              onClick={() => router.push(NEW_SC_ORDER_HREF)}
              disabled={pending || centers.length === 0}
            >
              New order
            </Button>
          ) : null
        }
        empty={pageItems.length === 0}
        emptyMessage={
          items.length === 0 ? "No service center orders yet." : "No orders match your search."
        }
        pageSize={{ value: pageSize, onChange: setPageSize }}
        pagination={{
          total,
          page,
          totalPages,
          itemLabel: "order",
          onPageChange: setPage,
        }}
      />

    </div>
  );
}
