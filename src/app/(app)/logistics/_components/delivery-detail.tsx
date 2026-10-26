"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { deliveryAuditLabel, DeliveryTracker } from "@/app/(app)/logistics/_components/delivery-tracker";
import {
  DocumentDetailBand,
  LogisticsHistoryBody,
} from "@/app/(app)/logistics/_components/logistics-detail-ui";
import {
  DeliveryDispatchDialog,
  DispatchingModal,
  type DispatchTarget,
} from "@/app/(app)/logistics/_components/delivery-dispatch-dialog";
import {
  DeliveryReceiveDialog,
  type ReceiveTarget,
} from "@/app/(app)/logistics/_components/delivery-receive-dialog";
import {
  DeliveryReturnRequestDialog,
  DeliveryReturnReviewDialog,
  type ReturnTarget,
  type ReviewReturnActions,
} from "@/app/(app)/logistics/_components/delivery-return-dialogs";
import { formatInventoryDrDate } from "@/app/(app)/inventory/_components/inventory-list-format";
import {
  CompactLineTable,
  CompactModelCell,
  type CompactLineColumn,
} from "@/components/compact-line-table";
import { RecordFieldGrid, RecordReadout, RecordSection, RecordSheet } from "@/components/record-section";
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
import {
  acceptDeliveryAction,
  cancelDeliveryReturnAction,
  decideDeliveryReturnAction,
  dispatchDeliveryAction,
  getDeliveryReturnAction,
  listDeliveryReceiptLinesAction,
  listDispatchCandidatesAction,
  rejectDeliveryAction,
  requestDeliveryReturnAction,
  retryDeliveryReturnSapAction,
} from "@/features/logistics/actions/logistics.actions";
import { isReturnOpen, needsSapRetry } from "@/features/logistics/constants/delivery-workflow-labels";
import type { LogisticsActionCapabilities } from "@/features/logistics/constants/logistics-permissions";
import type { DeliveryDetail } from "@/features/logistics/services/delivery-posting.service";
import { worksheetTotalsLabel } from "@/features/orders/lib/order-worksheet-filters";

const REVIEW_ACTIONS: ReviewReturnActions = {
  load: getDeliveryReturnAction,
  decide: decideDeliveryReturnAction,
  retry: retryDeliveryReturnSapAction,
  cancel: cancelDeliveryReturnAction,
};

type OrderLine = DeliveryDetail["orderLines"][number];
type SerialLine = DeliveryDetail["serials"][number];

const ORDER_LINE_COLUMNS: CompactLineColumn<OrderLine>[] = [
  {
    id: "model",
    header: "Model",
    cell: (line) => <CompactModelCell code={line.skuCode} name={line.modelName} />,
  },
  {
    id: "quantity",
    header: "Quantity",
    align: "right",
    className: "w-28 tabular-nums",
    cell: (line) => line.quantity.toLocaleString(),
  },
];

const SERIAL_COLUMNS: CompactLineColumn<SerialLine>[] = [
  {
    id: "model",
    header: "Model",
    cell: (line) => <CompactModelCell code={line.skuCode} name={line.modelName} />,
  },
  {
    id: "serial",
    header: "Serial number",
    className: "w-48 font-mono",
    cell: (line) => line.serialNo,
  },
];

function OrderLinesTable({ lines }: { lines: OrderLine[] }) {
  return (
    <CompactLineTable
      rows={lines}
      getRowId={(line) => line.id}
      columns={ORDER_LINE_COLUMNS}
      searchText={(line) => [line.skuCode, line.modelName, String(line.quantity)]}
      searchPlaceholder="Search lines…"
      itemLabel="line"
      emptyMessage="No approved lines on this order."
      noMatchMessage="No matching lines."
      summaryFor={(visible) =>
        worksheetTotalsLabel(
          visible.length,
          visible.reduce((sum, line) => sum + line.quantity, 0),
        )
      }
    />
  );
}

function SerialsTable({ lines }: { lines: SerialLine[] }) {
  return (
    <CompactLineTable
      rows={lines}
      getRowId={(line) => line.serialNumberId}
      columns={SERIAL_COLUMNS}
      searchText={(line) => [line.skuCode, line.modelName, line.serialNo]}
      searchPlaceholder="Search serials…"
      itemLabel="serial"
      emptyMessage="No serials on this delivery."
      noMatchMessage="No matching serials."
    />
  );
}

export function DeliveryDetailView({
  detail,
  capabilities,
}: {
  detail: DeliveryDetail;
  capabilities: LogisticsActionCapabilities;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [receiveTarget, setReceiveTarget] = useState<ReceiveTarget | null>(null);
  const [returnRequestTarget, setReturnRequestTarget] = useState<ReturnTarget | null>(null);
  const [returnReviewTarget, setReturnReviewTarget] = useState<ReturnTarget | null>(null);
  const [dispatchTarget, setDispatchTarget] = useState<DispatchTarget | null>(null);
  // Own flags: the shared `pending` also covers reject and return actions.
  const [openingDispatch, setOpeningDispatch] = useState(false);
  const [dispatching, setDispatching] = useState(false);

  const code = detail.status.code;
  const dispatched = code === "pending" || code === "partial";
  const latestReturn = detail.latestReturn;
  const returnOpen = isReturnOpen(latestReturn);
  const returnTarget = {
    id: detail.id,
    deliveryNo: detail.deliveryNo,
    branchName: detail.branch.name,
  };
  const hasSerials = detail.serials.length > 0;

  function refresh() {
    router.refresh();
  }

  function openDispatch() {
    setOpeningDispatch(true);
    startTransition(async () => {
      try {
        const result = await listDispatchCandidatesAction(detail.id);
        if (!("success" in result)) {
          toast.error(result.error);
          return;
        }
        setDispatchTarget({
          id: detail.id,
          deliveryNo: detail.deliveryNo,
          branchName: detail.branch.name,
          models: result.models,
          serials: result.serials,
        });
      } finally {
        setOpeningDispatch(false);
      }
    });
  }

  function confirmDispatch(serialNumberIds: string[]) {
    if (!dispatchTarget) return;
    setDispatching(true);
    startTransition(async () => {
      try {
        const result = await dispatchDeliveryAction(dispatchTarget.id, { serialNumberIds });
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success(
          `Dispatched ${result.movedCount} serial${result.movedCount === 1 ? "" : "s"}.${result.drNo ? ` DR# ${result.drNo}.` : ""}`,
        );
        setDispatchTarget(null);
        refresh();
      } finally {
        setDispatching(false);
      }
    });
  }

  function confirmReject() {
    startTransition(async () => {
      const result = await rejectDeliveryAction(detail.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Delivery rejected. Warehouse quantity is unchanged.");
      setRejectOpen(false);
      refresh();
    });
  }

  return (
    <div className="space-y-6">
      <DocumentDetailBand
        backHref="/logistics/deliveries"
        backLabel="Back to deliveries"
        title={detail.deliveryNo}
        statusLine={detail.status.name}
        actions={
          <>
            {code === "approved" && capabilities.canDispatch ? (
              <Button disabled={pending} aria-busy={openingDispatch} onClick={openDispatch}>
                {openingDispatch ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Dispatch
              </Button>
            ) : null}
            {code === "approved" && capabilities.canDispatch ? (
              <Button variant="outline" disabled={pending} onClick={() => setRejectOpen(true)}>
                Reject
              </Button>
            ) : null}
            {dispatched && !returnOpen && capabilities.canRequestDeliveryReturn ? (
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => setReturnRequestTarget(returnTarget)}
              >
                Request return
              </Button>
            ) : null}
            {latestReturn?.status === "PENDING_APPROVAL" && capabilities.canApproveDeliveryReturn ? (
              <Button disabled={pending} onClick={() => setReturnReviewTarget(returnTarget)}>
                Review return
              </Button>
            ) : null}
            {needsSapRetry(latestReturn) &&
            (capabilities.canApproveDeliveryReturn || capabilities.canRequestDeliveryReturn) ? (
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => setReturnReviewTarget(returnTarget)}
              >
                Retry SAP posting
              </Button>
            ) : null}
            {dispatched && !returnOpen && capabilities.canAcceptDelivery ? (
              <Button
                disabled={pending}
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={() =>
                  setReceiveTarget({
                    id: detail.id,
                    deliveryNo: detail.deliveryNo,
                    branchName: detail.branch.name,
                  })
                }
              >
                {code === "partial" ? "Receive remaining" : "Receive"}
              </Button>
            ) : null}
          </>
        }
      />

      <RecordSheet>
        <RecordSection title="Progress">
          <DeliveryTracker status={detail.status} history={detail.history} />
        </RecordSection>
        <RecordSection
          title="Delivery"
          description="Order, branch, and the delivery receipt."
          divided
        >
          <RecordFieldGrid>
            <RecordReadout label="Order" value={detail.order?.orderNumber ?? "—"} />
            <RecordReadout label="Branch" value={detail.branch.name} />
            <RecordReadout label="DR number" value={detail.drNo ?? "—"} />
            <RecordReadout label="DR date" value={formatInventoryDrDate(detail.drDate)} />
          </RecordFieldGrid>
        </RecordSection>
        <RecordSection
          title={hasSerials ? "Units" : "Models"}
          description={
            hasSerials
              ? "Serials on this delivery."
              : "Approved models and quantities on this delivery."
          }
          divided
        >
          {hasSerials ? (
            <SerialsTable lines={detail.serials} />
          ) : (
            <OrderLinesTable lines={detail.orderLines} />
          )}
        </RecordSection>
        <RecordSection title="History" divided>
          <LogisticsHistoryBody
            groupByLabel={false}
            items={detail.history.map((row) => ({
              id: row.id,
              label: deliveryAuditLabel(row.action),
              actor: row.userName,
              at: row.at,
            }))}
          />
        </RecordSection>
      </RecordSheet>

      <AlertDialog
        open={rejectOpen}
        onOpenChange={(open) => {
          if (!open && !pending) setRejectOpen(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject delivery?</AlertDialogTitle>
            <AlertDialogDescription>
              Reject <span className="font-medium text-foreground">{detail.deliveryNo}</span>
              {detail.order?.orderNumber ? <> (order {detail.order.orderNumber})</> : null} at {detail.branch.name}.
              Nothing has been dispatched, so warehouse quantity stays the same.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                confirmReject();
              }}
            >
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DeliveryReturnRequestDialog
        target={returnRequestTarget}
        onClose={() => setReturnRequestTarget(null)}
        onDone={refresh}
        submit={requestDeliveryReturnAction}
      />

      <DeliveryReturnReviewDialog
        target={returnReviewTarget}
        canApprove={capabilities.canApproveDeliveryReturn}
        canRetry={capabilities.canApproveDeliveryReturn || capabilities.canRequestDeliveryReturn}
        actions={REVIEW_ACTIONS}
        onClose={() => setReturnReviewTarget(null)}
        onDone={refresh}
      />

      <DeliveryReceiveDialog
        target={receiveTarget}
        onClose={() => setReceiveTarget(null)}
        onReceived={refresh}
        loadLines={listDeliveryReceiptLinesAction}
        accept={acceptDeliveryAction}
        canTransfer={capabilities.canCreateDeliveryTransfer}
      />

      <DeliveryDispatchDialog
        target={dispatchTarget}
        pending={pending}
        onClose={() => setDispatchTarget(null)}
        onConfirm={confirmDispatch}
      />
      <DispatchingModal open={dispatching} deliveryNo={dispatchTarget?.deliveryNo} />
    </div>
  );
}
