"use client";

import { useMemo, useState, useTransition } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  approveScReturnAction,
  completeScReturnRestoreAction,
  evaluateScReturnAction,
  listScReturnsAction,
  rejectScReturnAction,
} from "@/features/service-center-ops/actions/sc-sales.actions";
import type { ReturnsActionCapabilities } from "@/features/returns/constants/returns-permissions";
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

type ScReturnRow = Awaited<ReturnType<typeof listScReturnsAction>>["items"][number];

const returnColumn = createColumnHelper<DataTableFeatures, ScReturnRow>();

export function ScReturnsPanel({
  items,
  capabilities,
  emptyMessage = "No service center returns yet.",
}: {
  items: ScReturnRow[];
  capabilities: ReturnsActionCapabilities;
  emptyMessage?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(
    () =>
      items.filter((row) =>
        matchesTableSearch(query, [
          row.transactionNo,
          row.customerName ?? "",
          row.serviceCenter.name,
          row.serialNumber?.serialNo ?? "",
          row.atrStatus,
          row.returnRequest?.status ?? "",
          row.returnRequest?.requestNotes ?? "",
        ]),
      ),
    [items, query],
  );

  const sort = useClientTableSort(filtered, {
    txn: (row) => row.transactionNo,
    center: (row) => row.serviceCenter.name,
    atr: (row) => row.atrStatus,
    status: (row) => row.returnRequest?.status ?? "",
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

  function run(
    action: () => Promise<{ error?: string; success?: true }>,
    okMessage: string,
  ) {
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(okMessage);
      router.refresh();
    });
  }

  const columns = useMemo(() => {
    const cols: DataTableColumn<ScReturnRow>[] = [
      returnColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => indexOffset + row.index + 1,
        meta: { className: "tabular-nums text-muted-foreground" },
      }),
      returnColumn.display({
        id: "txn",
        header: "Transaction",
        enableSorting: true,
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.transactionNo}</div>
            <div className="text-xs text-muted-foreground">{row.original.customerName || "—"}</div>
          </div>
        ),
      }),
      returnColumn.display({
        id: "center",
        header: "Center",
        enableSorting: true,
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.serviceCenter.name}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.serviceCenterLocation
                ? `${row.original.serviceCenterLocation.name} (${row.original.serviceCenterLocation.code})`
                : "—"}
            </div>
          </div>
        ),
      }),
      returnColumn.display({
        id: "serial",
        header: "Serial",
        enableSorting: false,
        cell: ({ row }) => row.original.serialNumber?.serialNo ?? "—",
        meta: { className: "font-mono text-sm" },
      }),
      returnColumn.display({
        id: "atr",
        header: "ATR",
        enableSorting: true,
        cell: ({ row }) => <Badge variant="secondary">{row.original.atrStatus}</Badge>,
      }),
      returnColumn.display({
        id: "status",
        header: "Return",
        enableSorting: true,
        cell: ({ row }) =>
          row.original.returnRequest ? (
            <Badge variant="outline">{row.original.returnRequest.status}</Badge>
          ) : (
            "—"
          ),
      }),
      returnColumn.display({
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => {
          const rr = row.original.returnRequest;
          return (
            <div className="flex flex-col gap-2">
              {rr?.status === "pending_cs" && capabilities.canEvaluateReturn ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    run(() => evaluateScReturnAction(rr.id), "Evaluated — pending TL")
                  }
                >
                  Evaluate
                </Button>
              ) : null}
              {rr?.status === "pending_tl" && capabilities.canApproveReturn ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => run(() => approveScReturnAction(rr.id), "Return approved")}
                >
                  Approve
                </Button>
              ) : null}
              {rr &&
              ["pending_cs", "pending_tl"].includes(rr.status) &&
              (capabilities.canEvaluateReturn || capabilities.canApproveReturn) ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => run(() => rejectScReturnAction(rr.id), "Return rejected")}
                >
                  Reject
                </Button>
              ) : null}
              {rr?.status === "approved" && capabilities.canCompleteReturn ? (
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(() => completeScReturnRestoreAction(rr.id), "Stock restored to STK")
                  }
                >
                  Complete / restore
                </Button>
              ) : null}
            </div>
          );
        },
        meta: { wrap: true },
      }),
    ];
    return cols;
  }, [capabilities, indexOffset, pending]);

  return (
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
        placeholder: "Search transaction, serial, or center…",
      }}
      empty={pageItems.length === 0}
      emptyMessage={items.length === 0 ? emptyMessage : "No returns match your search."}
      pageSize={{ value: pageSize, onChange: setPageSize }}
      pagination={{
        total,
        page,
        totalPages,
        itemLabel: "return",
        onPageChange: setPage,
      }}
    />
  );
}
