"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  acceptScDeliveryAction,
  listScDeliveriesAction,
} from "@/features/service-center-ops/actions/sc-logistics.actions";
import { searchSerialsForScStockInAction } from "@/features/service-center-ops/actions/sc-inventory.actions";
import type { ScLogisticsActionCapabilities } from "@/features/service-center-ops/constants/sc-permissions";
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
import { Label } from "@/components/ui/label";
import { SearchableMultiSelect } from "@/features/aors/components/searchable-multi-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { matchesTableSearch } from "@/utils/match-table-search";

type DeliveryRow = Awaited<
  ReturnType<typeof listScDeliveriesAction>
>["items"][number];

const deliveryColumn = createColumnHelper<DataTableFeatures, DeliveryRow>();

export function ScDeliveriesPanel({
  items,
  capabilities,
}: {
  items: DeliveryRow[];
  capabilities: ScLogisticsActionCapabilities;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [accepting, setAccepting] = useState<DeliveryRow | null>(null);
  const [serialQuery, setSerialQuery] = useState("");
  const [serialOptions, setSerialOptions] = useState<
    { id: string; label: string }[]
  >([]);
  const [selectedSerialIds, setSelectedSerialIds] = useState<string[]>([]);

  const filtered = useMemo(
    () =>
      items.filter((row) =>
        matchesTableSearch(query, [
          row.deliveryNo,
          row.serviceCenter.name,
          row.order?.orderNumber ?? "",
          row.statusCode?.code ?? "",
        ]),
      ),
    [items, query],
  );

  const sort = useClientTableSort(filtered, {
    delivery: (row) => row.deliveryNo,
    center: (row) => row.serviceCenter.name,
    status: (row) => row.statusCode?.code ?? "",
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

  function openAccept(row: DeliveryRow) {
    setAccepting(row);
    setSelectedSerialIds([]);
    setSerialQuery("");
    setSerialOptions([]);
  }

  function searchSerials(value: string) {
    setSerialQuery(value);
    if (value.trim().length < 2) {
      setSerialOptions([]);
      return;
    }
    startTransition(async () => {
      const rows = await searchSerialsForScStockInAction(value);
      setSerialOptions(
        rows.map((r) => ({
          id: r.id,
          label: `${r.serialNo} · ${r.model.skuCode}`,
        })),
      );
    });
  }

  function submitAccept() {
    if (!accepting) return;
    if (selectedSerialIds.length === 0) {
      toast.error("Select at least one serial");
      return;
    }
    startTransition(async () => {
      const result = await acceptScDeliveryAction(accepting.id, {
        serialNumberIds: selectedSerialIds,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Accepted ${result.movedCount} serial(s) as STK`);
      setAccepting(null);
      router.refresh();
    });
  }

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
        id: "delivery",
        header: "Delivery",
        enableSorting: true,
        meta: { className: "font-medium" },
      }),
      deliveryColumn.accessor((row) => row.serviceCenter.name, {
        id: "center",
        header: "Center",
        enableSorting: true,
      }),
      deliveryColumn.display({
        id: "order",
        header: "Order",
        enableSorting: false,
        cell: ({ row }) => row.original.order?.orderNumber ?? "—",
      }),
      deliveryColumn.display({
        id: "status",
        header: "Status",
        enableSorting: true,
        cell: ({ row }) => (
          <Badge variant="secondary">{row.original.statusCode?.code ?? "—"}</Badge>
        ),
      }),
      deliveryColumn.accessor((row) => row._count.backloads, {
        id: "serials",
        header: "Serials",
        enableSorting: false,
        meta: { className: "tabular-nums" },
      }),
      deliveryColumn.display({
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => {
          const isAccepted = row.original.statusCode?.code === "accepted";
          return capabilities.canAcceptDelivery && !isAccepted ? (
            <Button size="sm" disabled={pending} onClick={() => openAccept(row.original)}>
              Accept
            </Button>
          ) : null;
        },
      }),
    ];
    return cols;
  }, [capabilities.canAcceptDelivery, indexOffset, pending]);

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
          placeholder: "Search delivery or center…",
        }}
        empty={pageItems.length === 0}
        emptyMessage={
          items.length === 0
            ? "No service center deliveries yet. Create one from an approved order."
            : "No deliveries match your search."
        }
        pageSize={{ value: pageSize, onChange: setPageSize }}
        pagination={{
          total,
          page,
          totalPages,
          itemLabel: "delivery",
          onPageChange: setPage,
        }}
      />

      <Sheet
        open={Boolean(accepting)}
        onOpenChange={(open) => !open && setAccepting(null)}
      >
        <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
          <SheetHeader className="border-b px-4 py-4 text-left">
            <SheetTitle>Accept delivery</SheetTitle>
            <SheetDescription>
              Supply serials to receive. Each becomes a backload line and STK
              inventory at the delivery location.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <p className="text-sm text-muted-foreground">
              {accepting?.deliveryNo} · {accepting?.serviceCenter.name}
            </p>
            <div className="space-y-2">
              <Label>Search serials</Label>
              <Input
                value={serialQuery}
                onChange={(e) => searchSerials(e.target.value)}
                placeholder="Type at least 2 characters…"
                disabled={pending}
              />
            </div>
            <SearchableMultiSelect
              label="Serials to receive"
              options={serialOptions}
              selectedIds={selectedSerialIds}
              onChange={setSelectedSerialIds}
              placeholder="Select serials…"
              searchPlaceholder="Filter…"
              emptyMessage="Search to load serials."
              disabled={pending}
            />
          </div>
          <SheetFooter className="border-t">
            <Button
              variant="outline"
              onClick={() => setAccepting(null)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button onClick={submitAccept} disabled={pending}>
              {pending ? "Saving…" : "Accept & stock in"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
