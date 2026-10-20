"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import {
  listScSalesAction,
  requestScReturnAction,
} from "@/features/service-center-ops/actions/sc-sales.actions";
import type { ScSalesActionCapabilities } from "@/features/service-center-ops/constants/sc-permissions";
import { useClientTablePagination } from "@/components/data-table";
import {
  DataTable,
  useClientTableSort,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { matchesTableSearch } from "@/utils/match-table-search";

type SaleRow = Awaited<ReturnType<typeof listScSalesAction>>["items"][number];

const saleColumn = createColumnHelper<DataTableFeatures, SaleRow>();

export function ScSalesPanel({
  items,
  capabilities,
}: {
  items: SaleRow[];
  capabilities: ScSalesActionCapabilities;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [reasonBySale, setReasonBySale] = useState<Record<string, string>>({});

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
        ]),
      ),
    [items, query],
  );

  const sort = useClientTableSort(filtered, {
    txn: (row) => row.transactionNo,
    center: (row) => row.serviceCenter.name,
    atr: (row) => row.atrStatus,
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
    const cols: DataTableColumn<SaleRow>[] = [
      saleColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => indexOffset + row.index + 1,
        meta: { className: "text-center tabular-nums text-muted-foreground" },
      }),
      saleColumn.display({
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
      saleColumn.display({
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
      saleColumn.display({
        id: "serial",
        header: "Serial",
        enableSorting: false,
        cell: ({ row }) => row.original.serialNumber?.serialNo ?? "—",
        meta: { className: "font-mono" },
      }),
      saleColumn.display({
        id: "atr",
        header: "ATR",
        enableSorting: true,
        cell: ({ row }) => <Badge variant="secondary">{row.original.atrStatus}</Badge>,
      }),
      saleColumn.display({
        id: "return",
        header: "Return",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.returnRequest ? (
            <Badge variant="outline">{row.original.returnRequest.status}</Badge>
          ) : (
            "—"
          ),
      }),
      saleColumn.display({
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => {
          const sale = row.original;
          const rr = sale.returnRequest;
          return (
            <div className="flex flex-col gap-2">
              {!rr && sale.atrStatus === "open" && capabilities.canRequestReturn ? (
                <>
                  <Input
                    placeholder="Return reason"
                    value={reasonBySale[sale.id] ?? ""}
                    onChange={(event) =>
                      setReasonBySale((prev) => ({
                        ...prev,
                        [sale.id]: event.target.value,
                      }))
                    }
                    disabled={pending}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => requestScReturnAction(sale.id, reasonBySale[sale.id]),
                        "Return requested — finish under Returns / Replacement",
                      )
                    }
                  >
                    Request return
                  </Button>
                </>
              ) : rr ? (
                <Button asChild size="sm" variant="ghost">
                  <Link href="/returns?tab=service">Open returns</Link>
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </div>
          );
        },
      }),
    ];
    return cols;
  }, [capabilities.canRequestReturn, indexOffset, pending, reasonBySale]);

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
      toolbarActions={
        capabilities.canCreateSale ? (
          <Button asChild>
            <Link href="/service-centers/sales/new">
              <Plus className="size-4" />
              New sale
            </Link>
          </Button>
        ) : null
      }
      empty={pageItems.length === 0}
      emptyMessage={
        items.length === 0 ? "No service center sales yet." : "No sales match your search."
      }
      pageSize={{ value: pageSize, onChange: setPageSize }}
      pagination={{
        total,
        page,
        totalPages,
        itemLabel: "sale",
        onPageChange: setPage,
      }}
    />
  );
}
