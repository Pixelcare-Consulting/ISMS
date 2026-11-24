"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  ScOrderSetupDialog,
  scOrderSetupHref,
  useScOrderSetup,
} from "@/app/(app)/service-centers/orders/new/_components/sc-order-setup";
import { listScCentersForOpsAction } from "@/features/service-center-ops/actions/sc-inventory.actions";
import {
  approveScOrderAction,
  cancelApprovedScOrderAction,
  listScOrdersAction,
  rejectScOrderAction,
} from "@/features/service-center-ops/actions/sc-orders.actions";
import { BRANCH_ORDER_STATUS_LABELS } from "@/features/orders/constants/order-status";
import { isScOrderApprovable } from "@/features/service-center-ordering/constants";
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
import { ScOrderDetailsDialog } from "@/app/(app)/service-centers/orders/_components/sc-order-details-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingModal } from "@/components/ui/loading-modal";
import { matchesTableSearch } from "@/utils/match-table-search";

type OrderRow = Awaited<ReturnType<typeof listScOrdersAction>>["items"][number];
type CenterOption = Awaited<ReturnType<typeof listScCentersForOpsAction>>[number];

const orderColumn = createColumnHelper<DataTableFeatures, OrderRow>();

const SC_ORDER_APPROVE_FEED = [
  { atSecond: 0, label: "Recording approval", hint: "Saving your decision to the order." },
  { atSecond: 1, label: "Posting the Sales Order to SAP", hint: "SAP can take a few seconds." },
  { atSecond: 3, label: "Refreshing orders list" },
];

const SC_ORDER_REJECT_FEED = [
  { atSecond: 0, label: "Recording rejection", hint: "Saving the order status." },
  { atSecond: 1, label: "Refreshing orders list" },
];

const SC_ORDER_CANCEL_FEED = [
  { atSecond: 0, label: "Checking the SO in SAP", hint: "ISMS refuses if a DR was already copied from it." },
  { atSecond: 2, label: "Closing the SO in SAP", hint: "SAP can take a few seconds." },
  { atSecond: 4, label: "Refreshing orders list" },
];

type OrderDecision = "approve" | "reject" | "cancel";

const DECISION_COPY: Record<
  OrderDecision,
  { question: string; description: string; destructive: boolean; title: string; feed: typeof SC_ORDER_APPROVE_FEED }
> = {
  approve: {
    question: "Approve this order?",
    description: "Are you sure you want to approve this order?",
    destructive: false,
    title: "Processing approval",
    feed: SC_ORDER_APPROVE_FEED,
  },
  reject: {
    question: "Reject this order?",
    description: "Are you sure you want to reject this order?",
    destructive: true,
    title: "Rejecting order",
    feed: SC_ORDER_REJECT_FEED,
  },
  cancel: {
    question: "Cancel this approved order?",
    description:
      "Its Sales Order will be closed in SAP and the order becomes Cancelled. ISMS refuses if SAP already copied any of it to a DR.",
    destructive: true,
    title: "Cancelling order",
    feed: SC_ORDER_CANCEL_FEED,
  },
};

/** Approved with an SO in SAP and no DR in ISMS yet. Cancel re-checks SAP itself. */
function isCancellableScOrder(order: OrderRow): boolean {
  return order.status === "approved" && order.sapDocNum != null && order.deliveries.length === 0;
}


export function ScOrdersPanel({
  items,
  centers,
  canCreate,
  canApprove,
}: {
  items: OrderRow[];
  centers: CenterOption[];
  canCreate: boolean;
  /** Supply Planning: the only approval step on SC orders. */
  canApprove: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  // Like branch orders: the setup popup opens over this list, and only Continue opens the
  // create page.
  const [setupOpen, setSetupOpen] = useState(false);
  const [processingAction, setProcessingAction] = useState<OrderDecision | null>(null);
  const [orderConfirm, setOrderConfirm] = useState<{
    orderId: string;
    action: OrderDecision;
  } | null>(null);
  const [detailsOrderId, setDetailsOrderId] = useState<string | null>(null);
  const scSetup = useScOrderSetup(setupOpen);
  const detailsOrder = items.find((item) => item.id === detailsOrderId) ?? null;
  const filtered = useMemo(
    () =>
      items.filter((row) =>
        matchesTableSearch(query, [
          row.orderNumber,
          row.serviceCenter.name,
          BRANCH_ORDER_STATUS_LABELS[row.status],
          row.poNumber ?? "",
          row.sapDocNum != null ? String(row.sapDocNum) : "",
          ...row.deliveries.map((delivery) => delivery.sapDocNo ?? ""),
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

  function confirmOrderDecision() {
    const decision = orderConfirm;
    if (!decision) return;
    setOrderConfirm(null);
    setProcessingAction(decision.action);
    startTransition(async () => {
      try {
        if (decision.action === "approve") {
          const result = await approveScOrderAction(decision.orderId);
          if ("error" in result) {
            toast.error(result.error);
            return;
          }
          toast.success(
            result.sapDocNum != null
              ? `Approved. SO ${result.sapDocNum} created in SAP`
              : "Order approved and posted to SAP",
          );
        } else if (decision.action === "cancel") {
          const result = await cancelApprovedScOrderAction(decision.orderId);
          if ("error" in result) {
            toast.error(result.error);
            return;
          }
          toast.success(`Order cancelled. SO ${result.sapSoNum} is closed in SAP`);
        } else {
          const result = await rejectScOrderAction(decision.orderId);
          if ("error" in result) {
            toast.error(result.error);
            return;
          }
          toast.success("Order rejected");
        }
        router.refresh();
      } finally {
        setProcessingAction(null);
      }
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
        id: "dr",
        header: "DR no.",
        enableSorting: false,
        cell: ({ row }) => {
          const drNos = row.original.deliveries.map((delivery) => delivery.sapDocNo).filter(Boolean);
          if (drNos.length > 0) return drNos.join(", ");
          return row.original.status === "approved" && row.original.sapDocNum != null
            ? "Waiting for SAP"
            : "—";
        },
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
        cell: ({ row }) => (
          <Badge variant="secondary">{BRANCH_ORDER_STATUS_LABELS[row.original.status]}</Badge>
        ),
      }),
      orderColumn.display({
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => {
          const order = row.original;
          return (
            <div className="flex flex-col gap-1">
              <Button size="sm" variant="outline" onClick={() => setDetailsOrderId(order.id)}>
                View details
              </Button>
              {canApprove && isScOrderApprovable(order.status) ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      setOrderConfirm({ orderId: order.id, action: "approve" })
                    }
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() =>
                      setOrderConfirm({ orderId: order.id, action: "reject" })
                    }
                  >
                    Reject
                  </Button>
                </>
              ) : null}
              {canApprove && isCancellableScOrder(order) ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => setOrderConfirm({ orderId: order.id, action: "cancel" })}
                >
                  Cancel order
                </Button>
              ) : null}
            </div>
          );
        },
      }),
    ];
    return cols;
  }, [canApprove, indexOffset, pending]);

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
            <Button onClick={() => setSetupOpen(true)} disabled={pending || centers.length === 0}>
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
      {canCreate ? (
        <ScOrderSetupDialog
          open={setupOpen}
          centers={scSetup.centers}
          setup={scSetup.setup}
          onOpenChange={setSetupOpen}
          onContinue={(choice) => {
            setSetupOpen(false);
            router.push(scOrderSetupHref(choice));
          }}
        />
      ) : null}
      <AlertDialog
        open={orderConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setOrderConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{DECISION_COPY[orderConfirm?.action ?? "approve"].question}</AlertDialogTitle>
            <AlertDialogDescription>
              {DECISION_COPY[orderConfirm?.action ?? "approve"].description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmOrderDecision}
              className={
                orderConfirm && DECISION_COPY[orderConfirm.action].destructive
                  ? "bg-destructive text-white hover:bg-destructive/90"
                  : undefined
              }
            >
              Yes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ScOrderDetailsDialog
        order={detailsOrder}
        onOpenChange={(open) => {
          if (!open) setDetailsOrderId(null);
        }}
      />
      <LoadingModal
        open={pending && processingAction !== null}
        title={DECISION_COPY[processingAction ?? "approve"].title}
        description="Please wait while the order is saved."
        feedItems={DECISION_COPY[processingAction ?? "approve"].feed}
      />
    </div>
  );
}
