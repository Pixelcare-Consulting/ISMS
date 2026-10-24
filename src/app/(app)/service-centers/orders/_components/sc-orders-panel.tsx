"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { listScCentersForOpsAction } from "@/features/service-center-ops/actions/sc-inventory.actions";
import { createScDeliveryFromOrderAction } from "@/features/service-center-ops/actions/sc-logistics.actions";
import {
  approveScOrderAction,
  createScOrderAction,
  listModelsForScOrderAction,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { matchesTableSearch } from "@/utils/match-table-search";

type OrderRow = Awaited<ReturnType<typeof listScOrdersAction>>["items"][number];
type CenterOption = Awaited<ReturnType<typeof listScCentersForOpsAction>>[number];

const orderColumn = createColumnHelper<DataTableFeatures, OrderRow>();

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
  const [sheetOpen, setSheetOpen] = useState(false);
  const [serviceCenterId, setServiceCenterId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [modelId, setModelId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [modelOptions, setModelOptions] = useState<{ id: string; label: string }[]>(
    [],
  );

  const locations = useMemo(() => {
    const center = centers.find((c) => c.id === serviceCenterId);
    return (center?.locations ?? []).map((l) => ({
      id: l.id,
      label: `${l.name} (${l.code})`,
    }));
  }, [centers, serviceCenterId]);

  const filtered = useMemo(
    () =>
      items.filter((row) =>
        matchesTableSearch(query, [
          row.orderNumber,
          row.serviceCenter.name,
          row.status,
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

  function openCreate() {
    setServiceCenterId(centers[0]?.id ?? "");
    setLocationId(centers[0]?.locations[0]?.id ?? "");
    setModelId("");
    setQuantity("1");
    setSheetOpen(true);
    startTransition(async () => {
      const models = await listModelsForScOrderAction();
      setModelOptions(
        models.map((m) => ({ id: m.id, label: `${m.skuCode} · ${m.name}` })),
      );
    });
  }

  function submitCreate() {
    const qty = Number(quantity);
    if (!serviceCenterId || !modelId || !Number.isInteger(qty) || qty < 1) {
      toast.error("Select center, model, and quantity");
      return;
    }
    startTransition(async () => {
      const result = await createScOrderAction({
        serviceCenterId,
        serviceCenterLocationId: locationId || null,
        lines: [{ modelId, quantity: qty }],
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Order ${result.orderNumber} created`);
      setSheetOpen(false);
      router.refresh();
    });
  }

  function run(
    action: () => Promise<{ error?: string; success?: true }>,
    ok: string,
  ) {
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(ok);
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
                    onClick={() => run(() => approveScOrderAction(order.id), "Order approved")}
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
          placeholder: "Search order or center…",
        }}
        toolbarActions={
          canCreate ? (
            <Button onClick={openCreate} disabled={pending || centers.length === 0}>
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

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
          <SheetHeader className="border-b px-4 py-4 text-left">
            <SheetTitle>New service center order</SheetTitle>
            <SheetDescription>
              Create a manual order for approval, then delivery accept.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <SearchableSelect
              label="Service center"
              options={centers.map((c) => ({
                id: c.id,
                label: `${c.name} (${c.sapCode})`,
              }))}
              value={serviceCenterId}
              onChange={(id) => {
                setServiceCenterId(id);
                setLocationId(
                  centers.find((c) => c.id === id)?.locations[0]?.id ?? "",
                );
              }}
              placeholder="Select center…"
              searchPlaceholder="Search…"
              disabled={pending}
            />
            <SearchableSelect
              label="Location"
              options={locations}
              value={locationId}
              onChange={setLocationId}
              placeholder="Select location…"
              searchPlaceholder="Search…"
              disabled={pending}
            />
            <SearchableSelect
              label="Model"
              options={modelOptions}
              value={modelId}
              onChange={setModelId}
              placeholder="Select model…"
              searchPlaceholder="Filter models…"
              disabled={pending}
            />
            <div className="space-y-2">
              <Label htmlFor="qty">Quantity</Label>
              <Input
                id="qty"
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                disabled={pending}
              />
            </div>
          </div>
          <SheetFooter className="border-t">
            <Button variant="outline" onClick={() => setSheetOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submitCreate} disabled={pending}>
              {pending ? "Saving…" : "Create order"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
