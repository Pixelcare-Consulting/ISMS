"use client";

import { createColumnHelper, type RowSelectionState } from "@tanstack/react-table";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  acceptDeliveryAction,
  dispatchDeliveryAction,
  listDeliveryReceiptLinesAction,
  listDispatchCandidatesAction,
  rejectDeliveryAction,
} from "@/features/logistics/actions/logistics.actions";
import type { LogisticsActionCapabilities } from "@/features/logistics/constants/logistics-permissions";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DeliveryReceiveDialog,
  type ReceiveTarget,
} from "@/app/(app)/logistics/_components/delivery-receive-dialog";
import {
  buildLogisticsPageHref,
  LOGISTICS_DELIVERIES_PATH,
} from "@/app/(app)/logistics/_components/logistics-paths";
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
  statusCode: StatusCodeRef;
  branch: { name: string };
  order: { orderNumber: string } | null;
}

interface DeliveriesPanelProps {
  deliveries: PaginatedList<DeliveryRow>;
  capabilities: LogisticsActionCapabilities;
  initialSort?: string;
  initialSortDir?: string;
}

const deliveryColumn = createColumnHelper<DataTableFeatures, DeliveryRow>();

type DeliverySortField = "deliveryNo" | "orderNumber" | "branch" | "status";
type DeliverySortDir = "asc" | "desc";

type PendingReject = {
  id: string;
  deliveryNo: string;
  branchName: string;
  orderNumber?: string;
  statusCode: string;
};

interface DispatchCandidate {
  id: string;
  serialNo: string;
  warehouseCode: string;
  locationCode: string;
}

export function DeliveriesPanel({
  deliveries,
  capabilities,
  initialSort = "",
  initialSortDir = "desc",
}: DeliveriesPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [pendingConfirm, setPendingConfirm] = useState<PendingReject | null>(null);
  const [receiveTarget, setReceiveTarget] = useState<ReceiveTarget | null>(null);
  const [dispatchTarget, setDispatchTarget] = useState<DeliveryRow | null>(null);
  const [dispatchSerials, setDispatchSerials] = useState<DispatchCandidate[]>([]);
  const [dispatchRequired, setDispatchRequired] = useState(0);
  const [dispatchSelected, setDispatchSelected] = useState<string[]>([]);
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
        deliveries.items.map((d) => d.branch.name),
        deliveries.items.map((d) => d.order?.orderNumber),
        deliveries.items.map((d) => d.statusCode.name),
        deliveries.items.map((d) => d.statusCode.code),
      ),
    [deliveries.items],
  );

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const selectedCount = filtered.filter((row) => rowSelection[row.id]).length;

  function confirmPendingAction() {
    if (!pendingConfirm) return;
    const { id } = pendingConfirm;
    startTransition(async () => {
      const result = await rejectDeliveryAction(id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.returnedCount
          ? `Delivery rejected. ${result.returnedCount} serial${result.returnedCount === 1 ? "" : "s"} returned to the warehouse.`
          : "Delivery rejected. Warehouse quantity is unchanged.",
      );
      setPendingConfirm(null);
      router.refresh();
    });
  }

  function openDispatch(row: DeliveryRow) {
    startTransition(async () => {
      const result = await listDispatchCandidatesAction(row.id);
      if (!("success" in result)) {
        toast.error(result.error);
        return;
      }
      const chosen = result.serials.slice(0, result.requiredQty).map((serial) => serial.id);
      setDispatchTarget(row);
      setDispatchSerials(result.serials);
      setDispatchRequired(result.requiredQty);
      setDispatchSelected(chosen);
    });
  }

  function confirmDispatch() {
    if (!dispatchTarget) return;
    startTransition(async () => {
      const result = await dispatchDeliveryAction(dispatchTarget.id, {
        serialNumberIds: dispatchSelected,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Dispatched ${result.movedCount} serial${result.movedCount === 1 ? "" : "s"}. Delivery is pending acceptance.`);
      setDispatchTarget(null);
      router.refresh();
    });
  }

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
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => {
          const delivery = row.original;
          return (
            <div className="flex justify-end gap-2">
              {delivery.statusCode.code === "approved" && capabilities.canDispatch ? (
                <Button size="sm" disabled={pending} onClick={() => openDispatch(delivery)}>
                  Dispatch
                </Button>
              ) : null}
              {(delivery.statusCode.code === "approved" ||
                delivery.statusCode.code === "pending" ||
                delivery.statusCode.code === "partial") &&
              (delivery.statusCode.code === "approved"
                ? capabilities.canManage
                : capabilities.canAcceptDelivery) ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    setPendingConfirm({
                      id: delivery.id,
                      deliveryNo: delivery.deliveryNo,
                      branchName: delivery.branch.name,
                      orderNumber: delivery.order?.orderNumber,
                      statusCode: delivery.statusCode.code,
                    })
                  }
                >
                  Reject
                </Button>
              ) : null}
              {(delivery.statusCode.code === "pending" ||
                delivery.statusCode.code === "partial") &&
              capabilities.canAcceptDelivery ? (
                <Button
                  size="sm"
                  disabled={pending}
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={() =>
                    setReceiveTarget({
                      id: delivery.id,
                      deliveryNo: delivery.deliveryNo,
                      branchName: delivery.branch.name,
                    })
                  }
                >
                  {delivery.statusCode.code === "partial" ? "Receive remaining" : "Receive"}
                </Button>
              ) : null}
            </div>
          );
        },
      }),
    ];
    return cols;
  }, [capabilities.canAcceptDelivery, capabilities.canDispatch, capabilities.canManage, indexOffset, pending]);

  return (
    <>
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
        enableRowSelection
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        selectAllLabel="Select all deliveries"
        getSelectionLabel={(row) => `Select delivery ${row.deliveryNo}`}
        stickyHeader
        search={{ value: query, onChange: setQuery, placeholder: "Search deliveries…", suggestions }}
        toolbarActions={
          selectedCount > 0 ? (
            <Button variant="secondary" onClick={() => setRowSelection({})}>
              {selectedCount} selected
            </Button>
          ) : null
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

      <AlertDialog
        open={pendingConfirm !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setPendingConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject delivery?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingConfirm ? (
                <>
                  Reject{" "}
                  <span className="font-medium text-foreground">{pendingConfirm.deliveryNo}</span>
                  {pendingConfirm.orderNumber ? <> (order {pendingConfirm.orderNumber})</> : null} at{" "}
                  {pendingConfirm.branchName}.{" "}
                  {pendingConfirm.statusCode === "approved"
                    ? "Nothing has been dispatched, so warehouse quantity stays the same."
                    : "Serials still in transit go back to the warehouse. Units already accepted stay at the branch."}
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                confirmPendingAction();
              }}
            >
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DeliveryReceiveDialog
        target={receiveTarget}
        onClose={() => setReceiveTarget(null)}
        onReceived={() => router.refresh()}
        loadLines={listDeliveryReceiptLinesAction}
        accept={acceptDeliveryAction}
      />

      <Dialog
        open={dispatchTarget !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setDispatchTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Dispatch {dispatchTarget?.deliveryNo}</DialogTitle>
            <DialogDescription>
              Choose {dispatchRequired} warehouse serial{dispatchRequired === 1 ? "" : "s"} for{" "}
              {dispatchTarget?.branch.name}. Dispatch moves them into transit. Warehouse quantity
              drops by the same number.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {dispatchSerials.length === 0 ? (
              <p className="text-sm text-muted-foreground">No warehouse serials are available for this order.</p>
            ) : (
              dispatchSerials.map((serial) => {
                const checked = dispatchSelected.includes(serial.id);
                return (
                  <label key={serial.id} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(value) => {
                        setDispatchSelected((current) =>
                          value === true
                            ? [...current, serial.id]
                            : current.filter((id) => id !== serial.id),
                        );
                      }}
                      aria-label={`Allocate ${serial.serialNo}`}
                    />
                    <span className="font-mono">{serial.serialNo}</span>
                    <span className="text-muted-foreground">
                      {serial.warehouseCode} / {serial.locationCode}
                    </span>
                  </label>
                );
              })
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setDispatchTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={pending || dispatchSelected.length !== dispatchRequired || dispatchRequired === 0}
              onClick={confirmDispatch}
            >
              Dispatch {dispatchSelected.length}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
