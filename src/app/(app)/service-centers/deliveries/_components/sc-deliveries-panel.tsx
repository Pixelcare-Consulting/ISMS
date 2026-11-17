"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { RefreshCw } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  acceptScDeliveryAction,
  checkScOrdersInSapAction,
  listScDeliveriesAction,
} from "@/features/service-center-ops/actions/sc-logistics.actions";
import { summarizeScOrderSapCheck } from "@/features/service-center-ordering/lib/sc-order-sap-check";
import { searchSerialsForScStockInAction } from "@/features/service-center-ops/actions/sc-inventory.actions";
import type { ScLogisticsActionCapabilities } from "@/features/service-center-ops/constants/sc-permissions";
import { useClientTablePagination } from "@/components/data-table";
import {
  DataTable,
  useClientTableSort,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
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

/** A delivery Check SAP made from a SAP DR carries the DR's serials. */
function isFromSap(row: DeliveryRow): boolean {
  return row.lines.length > 0;
}

function openSapLines(row: DeliveryRow) {
  return row.lines.filter((line) => line.acceptedAt === null);
}

function drLabel(row: DeliveryRow): string {
  if (!row.sapDocNo) return "—";
  return row.sapDocDate
    ? `${row.sapDocNo} · ${new Date(row.sapDocDate).toLocaleDateString("en-PH", { timeZone: "UTC" })}`
    : row.sapDocNo;
}

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
  const [acceptConfirmOpen, setAcceptConfirmOpen] = useState(false);
  const [serialQuery, setSerialQuery] = useState("");
  const [serialOptions, setSerialOptions] = useState<
    { id: string; label: string }[]
  >([]);
  const [selectedSerialIds, setSelectedSerialIds] = useState<string[]>([]);
  const [locationId, setLocationId] = useState("");

  const filtered = useMemo(
    () =>
      items.filter((row) =>
        matchesTableSearch(query, [
          row.deliveryNo,
          row.sapDocNo ?? "",
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
    // A SAP delivery starts with every unit on the DR that is not accepted yet.
    setSelectedSerialIds(openSapLines(row).map((line) => line.serialNumberId));
    setLocationId("");
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
    if (
      isFromSap(accepting) &&
      !accepting.serviceCenterLocation &&
      !locationId
    ) {
      return;
    }
    setAcceptConfirmOpen(true);
  }

  function confirmAccept() {
    if (!accepting) return;
    const deliveryId = accepting.id;
    const serialNumberIds = selectedSerialIds;
    const serviceCenterLocationId = locationId || null;
    setAcceptConfirmOpen(false);
    startTransition(async () => {
      const result = await acceptScDeliveryAction(deliveryId, {
        serialNumberIds,
        serviceCenterLocationId,
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

  /** DRs SAP users copied from approved SC orders' Sales Orders become deliveries here. */
  function checkSap() {
    startTransition(async () => {
      const result = await checkScOrdersInSapAction();
      if ("error" in result) {
        toast.error("Could not check SAP", { description: result.error });
        return;
      }
      const summary = summarizeScOrderSapCheck(result);
      toast[summary.tone](summary.title, { description: summary.description });
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
      deliveryColumn.display({
        id: "dr",
        header: "DR no.",
        enableSorting: false,
        cell: ({ row }) => drLabel(row.original),
        meta: { className: "tabular-nums" },
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
      deliveryColumn.display({
        id: "serials",
        header: "Serials",
        enableSorting: false,
        // A SAP delivery shows accepted of shipped; an older one, what was received.
        cell: ({ row }) =>
          isFromSap(row.original)
            ? `${row.original.lines.length - openSapLines(row.original).length} / ${row.original.lines.length} accepted`
            : row.original._count.backloads,
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
        toolbarActions={
          capabilities.canCheckSap ? (
            <Button type="button" variant="outline" disabled={pending} onClick={checkSap}>
              <RefreshCw className={`mr-1 size-4 ${pending ? "animate-spin" : ""}`} aria-hidden />
              Check SAP now
            </Button>
          ) : null
        }
        empty={pageItems.length === 0}
        emptyMessage={
          items.length === 0
            ? "No service center deliveries yet. Check SAP now adds the DRs SAP copied from approved SC orders."
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
        onOpenChange={(open) => {
          if (!open) {
            setAccepting(null);
            setAcceptConfirmOpen(false);
          }
        }}
      >
        <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
          <SheetHeader className="border-b px-4 py-4 text-left">
            <SheetTitle>Accept delivery</SheetTitle>
            <SheetDescription>
              {accepting && isFromSap(accepting)
                ? "Units on the SAP DR. The ones you accept become STK at the service center."
                : "Supply serials to receive. Each becomes STK inventory at the delivery location."}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <p className="text-sm text-muted-foreground">
              {accepting?.deliveryNo}
              {accepting?.sapDocNo ? ` · DR ${accepting.sapDocNo}` : ""} · {accepting?.serviceCenter.name}
            </p>
            {accepting && isFromSap(accepting) ? (
              <>
                {accepting.serviceCenterLocation ? (
                  <p className="text-sm">
                    Location: {accepting.serviceCenterLocation.code} · {accepting.serviceCenterLocation.name}
                  </p>
                ) : (
                  <SearchableSelect
                    label="Receiving location"
                    className="w-full"
                    options={accepting.serviceCenter.locations.map((location) => ({
                      id: location.id,
                      label: location.name,
                      description: location.code,
                    }))}
                    value={locationId}
                    onChange={setLocationId}
                    placeholder="Select location…"
                    searchPlaceholder="Search locations…"
                    emptyMessage="This service center has no locations."
                    disabled={pending}
                  />
                )}
                <SearchableMultiSelect
                  label="Units to accept"
                  options={openSapLines(accepting).map((line) => ({
                    id: line.serialNumberId,
                    label: `${line.serialNumber.serialNo} · ${line.serialNumber.model.skuCode}`,
                  }))}
                  selectedIds={selectedSerialIds}
                  onChange={setSelectedSerialIds}
                  placeholder="Select units…"
                  searchPlaceholder="Filter serials…"
                  emptyMessage="Every unit on this DR is accepted."
                  disabled={pending}
                />
              </>
            ) : (
              <>
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
              </>
            )}
          </div>
          <SheetFooter className="border-t">
            <Button
              variant="outline"
              onClick={() => setAccepting(null)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              onClick={submitAccept}
              disabled={
                pending ||
                selectedSerialIds.length === 0 ||
                Boolean(accepting && isFromSap(accepting) && !accepting.serviceCenterLocation && !locationId)
              }
            >
              {pending ? "Saving…" : "Accept & stock in"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <AlertDialog
        open={acceptConfirmOpen}
        onOpenChange={(open) => {
          if (!open) setAcceptConfirmOpen(false);
        }}
      >
        <AlertDialogContent className="z-60" overlayClassName="z-60">
          <AlertDialogHeader>
            <AlertDialogTitle>Accept this delivery?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to accept this delivery?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAccept}>Yes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
