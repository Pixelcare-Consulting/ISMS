"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { Truck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { DeliveryTracker } from "@/app/(app)/logistics/_components/delivery-tracker";
import {
  LogisticsDocumentHeader,
  LogisticsInfoCard,
  LogisticsProgressCard,
  LogisticsTableHeading,
} from "@/app/(app)/logistics/_components/logistics-detail-ui";
import {
  DeliveryDispatchDialog,
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
import { uniqueSearchSuggestions, useClientTablePagination } from "@/components/data-table";
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
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import {
  DataTable,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
import { matchesTableSearch } from "@/utils/match-table-search";

const REVIEW_ACTIONS: ReviewReturnActions = {
  load: getDeliveryReturnAction,
  decide: decideDeliveryReturnAction,
  retry: retryDeliveryReturnSapAction,
  cancel: cancelDeliveryReturnAction,
};

type OrderLine = DeliveryDetail["orderLines"][number];
type SerialLine = DeliveryDetail["serials"][number];

const orderLineColumn = createColumnHelper<DataTableFeatures, OrderLine>();
const serialColumn = createColumnHelper<DataTableFeatures, SerialLine>();

function ModelSummary({ skuCode, name }: { skuCode: string; name: string }) {
  const title = name ? `${skuCode} — ${name}` : skuCode;
  return (
    <div className="w-56 max-w-full min-w-0" title={title}>
      <p className="truncate">{skuCode}</p>
      {name ? <p className="truncate text-xs text-muted-foreground">{name}</p> : null}
    </div>
  );
}

function OrderLinesTable({ lines }: { lines: OrderLine[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () =>
      lines.filter((line) =>
        matchesTableSearch(query, [line.skuCode, line.modelName, String(line.quantity)]),
      ),
    [lines, query],
  );
  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        lines.map((line) => line.skuCode),
        lines.map((line) => line.modelName),
      ),
    [lines],
  );
  const { page, setPage, pageSize, setPageSize, total, totalPages, pageItems, indexOffset } =
    useClientTablePagination(filtered, { resetKey: query });

  const columns = useMemo(() => {
    const cols: DataTableColumn<OrderLine>[] = [
      orderLineColumn.display({
        id: "index",
        header: "#",
        cell: ({ row }) => indexOffset + row.index + 1,
        meta: { className: "tabular-nums text-muted-foreground" },
      }),
      orderLineColumn.display({
        id: "model",
        header: "Model",
        cell: ({ row }) => (
          <ModelSummary skuCode={row.original.skuCode} name={row.original.modelName} />
        ),
      }),
      orderLineColumn.display({
        id: "quantity",
        header: "Quantity",
        cell: ({ row }) => row.original.quantity,
        meta: { className: "tabular-nums" },
      }),
    ];
    return cols;
  }, [indexOffset]);

  return (
    <DataTable
      data={pageItems}
      columns={columns}
      getRowId={(row) => row.id}
      manualPagination
      stickyHeader
      search={{
        value: query,
        onChange: setQuery,
        placeholder: "Search lines…",
        suggestions,
      }}
      pageSize={{ value: pageSize, onChange: setPageSize }}
      toolbarLeading={
        <LogisticsTableHeading title="Approved lines" count={lines.length} itemLabel="line" />
      }
      pagination={{
        total,
        page,
        totalPages,
        itemLabel: "line",
        onPageChange: setPage,
      }}
      empty={pageItems.length === 0}
      emptyMessage={lines.length === 0 ? "No approved lines on this order." : "No matching lines."}
    />
  );
}

function SerialsTable({ lines }: { lines: SerialLine[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () =>
      lines.filter((line) => matchesTableSearch(query, [line.skuCode, line.modelName, line.serialNo])),
    [lines, query],
  );
  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        lines.map((line) => line.serialNo),
        lines.map((line) => line.skuCode),
        lines.map((line) => line.modelName),
      ),
    [lines],
  );
  const { page, setPage, pageSize, setPageSize, total, totalPages, pageItems, indexOffset } =
    useClientTablePagination(filtered, { resetKey: query });

  const columns = useMemo(() => {
    const cols: DataTableColumn<SerialLine>[] = [
      serialColumn.display({
        id: "index",
        header: "#",
        cell: ({ row }) => indexOffset + row.index + 1,
        meta: { className: "tabular-nums text-muted-foreground" },
      }),
      serialColumn.display({
        id: "model",
        header: "Model",
        cell: ({ row }) => (
          <ModelSummary skuCode={row.original.skuCode} name={row.original.modelName} />
        ),
      }),
      serialColumn.display({
        id: "serial",
        header: "Serial number",
        cell: ({ row }) => row.original.serialNo,
        meta: { className: "font-mono" },
      }),
    ];
    return cols;
  }, [indexOffset]);

  return (
    <DataTable
      data={pageItems}
      columns={columns}
      getRowId={(row) => row.serialNumberId}
      manualPagination
      stickyHeader
      search={{
        value: query,
        onChange: setQuery,
        placeholder: "Search serials…",
        suggestions,
      }}
      pageSize={{ value: pageSize, onChange: setPageSize }}
      toolbarLeading={<LogisticsTableHeading title="Units" count={lines.length} itemLabel="unit" />}
      pagination={{
        total,
        page,
        totalPages,
        itemLabel: "serial",
        onPageChange: setPage,
      }}
      empty={pageItems.length === 0}
      emptyMessage={lines.length === 0 ? "No serials on this delivery." : "No matching serials."}
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
    startTransition(async () => {
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
    });
  }

  function confirmDispatch(serialNumberIds: string[]) {
    if (!dispatchTarget) return;
    startTransition(async () => {
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
      <LogisticsDocumentHeader
        backHref="/logistics/deliveries"
        backLabel="Back to deliveries"
        context="Delivery"
        title={detail.deliveryNo}
        statusCode={detail.status.code}
        statusColor={detail.status.color}
        badges={
          <StatusCodeBadge
            code={detail.status.code}
            name={detail.status.name}
            color={detail.status.color}
          />
        }
        actions={
          <>
            {code === "approved" && capabilities.canDispatch ? (
              <Button size="sm" disabled={pending} onClick={openDispatch}>
                Dispatch
              </Button>
            ) : null}
            {code === "approved" && capabilities.canDispatch ? (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => setRejectOpen(true)}>
                Reject
              </Button>
            ) : null}
            {dispatched && !returnOpen && capabilities.canRequestDeliveryReturn ? (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => setReturnRequestTarget(returnTarget)}
              >
                Request return
              </Button>
            ) : null}
            {latestReturn?.status === "PENDING_APPROVAL" && capabilities.canApproveDeliveryReturn ? (
              <Button size="sm" disabled={pending} onClick={() => setReturnReviewTarget(returnTarget)}>
                Review return
              </Button>
            ) : null}
            {needsSapRetry(latestReturn) &&
            (capabilities.canApproveDeliveryReturn || capabilities.canRequestDeliveryReturn) ? (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => setReturnReviewTarget(returnTarget)}
              >
                Retry SAP posting
              </Button>
            ) : null}
            {dispatched && !returnOpen && capabilities.canAcceptDelivery ? (
              <Button
                size="sm"
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

      <LogisticsProgressCard>
        <DeliveryTracker status={detail.status} history={detail.history} />
      </LogisticsProgressCard>

      <LogisticsInfoCard title="Delivery" icon={Truck} tone="sky">
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Order</dt>
            <dd className="mt-1 text-sm font-medium">{detail.order?.orderNumber ?? "—"}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Branch</dt>
            <dd className="mt-1 text-sm font-medium">{detail.branch.name}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">DR number</dt>
            <dd className="mt-1 text-sm font-medium">{detail.drNo ?? "—"}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">DR date</dt>
            <dd className="mt-1 text-sm font-medium">{formatInventoryDrDate(detail.drDate)}</dd>
          </div>
        </dl>
      </LogisticsInfoCard>

      {hasSerials ? <SerialsTable lines={detail.serials} /> : <OrderLinesTable lines={detail.orderLines} />}

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
    </div>
  );
}
