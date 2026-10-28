"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createColumnHelper, type RowSelectionState } from "@tanstack/react-table";

import {
  DeliveryReceiveDialog,
  type ReceiveTarget,
} from "@/app/(app)/logistics/_components/delivery-receive-dialog";
import { PulloutRequestDialog } from "@/app/(app)/logistics/_components/pullout-request-dialog";
import { TransferRequestDialog } from "@/app/(app)/logistics/_components/transfer-request-dialog";
import {
  DeliveryReturnCell,
  DeliveryReturnRequestDialog,
  DeliveryReturnReviewDialog,
  type LatestDeliveryReturn,
  type ReturnTarget,
  type ReviewReturnActions,
} from "@/app/(app)/logistics/_components/delivery-return-dialogs";
import { isReturnOpen, needsSapRetry } from "@/features/logistics/constants/delivery-workflow-labels";
import {
  acceptDeliveryAction,
  createPulloutAction,
  createTransferAction,
  cancelDeliveryReturnAction,
  decideDeliveryReturnAction,
  getDeliveryReturnAction,
  listDeliveryReceiptLinesAction,
  requestDeliveryReturnAction,
  retryDeliveryReturnSapAction,
} from "@/features/ops/actions/ops.actions";
import { formatInventoryDrDate } from "@/app/(app)/inventory/_components/inventory-list-format";
import {
  formatSapDocNo,
  SAP_DOC_DATE_LABEL,
  SAP_DOC_NO_LABEL,
} from "@/features/logistics/lib/sap-doc-number";
import type { OrderSapDocType } from "@/features/orders/constants/order-sap-doc-type";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  useClientTableSort,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";

interface StatusCodeRef {
  id: string;
  code: string;
  name: string;
  color?: string | null;
}

interface OpsPanelProps {
  currentUserName?: string;
  deliveries: {
    id: string;
    deliveryNo: string;
    drNo: string | null;
    drDate: Date | string | null;
    statusCode: StatusCodeRef;
    branch: { name: string };
    order: { sapDocType: OrderSapDocType | null } | null;
    /** Latest return request, newest first (at most one). */
    returnRequests: LatestDeliveryReturn[];
  }[];
  transfers: {
    id: string;
    statusCode: StatusCodeRef;
    fromBranch: { name: string };
    toBranch: { name: string };
  }[];
  pullouts: { id: string; statusCode: StatusCodeRef; branch: { name: string } }[];
  /** Shows Transfer actions in the receive dialog. */
  canCreateDeliveryTransfer?: boolean;
  canRequestDeliveryReturn?: boolean;
  canApproveDeliveryReturn?: boolean;
}

const REVIEW_ACTIONS: ReviewReturnActions = {
  load: getDeliveryReturnAction,
  decide: decideDeliveryReturnAction,
  retry: retryDeliveryReturnSapAction,
  cancel: cancelDeliveryReturnAction,
};

type DeliveryRow = OpsPanelProps["deliveries"][number];
type TransferRow = OpsPanelProps["transfers"][number];
type PulloutRow = OpsPanelProps["pullouts"][number];

const deliveryColumn = createColumnHelper<DataTableFeatures, DeliveryRow>();
const transferColumn = createColumnHelper<DataTableFeatures, TransferRow>();
const pulloutColumn = createColumnHelper<DataTableFeatures, PulloutRow>();

/** Dispatched deliveries the branch can still receive or return. */
const RECEIVABLE_DELIVERY_CODES = new Set(["pending", "partial"]);

export function OpsPanel({
  deliveries,
  transfers,
  pullouts,
  currentUserName = "",
  canCreateDeliveryTransfer = false,
  canRequestDeliveryReturn = false,
  canApproveDeliveryReturn = false,
}: OpsPanelProps) {
  const router = useRouter();
  const [transferOpen, setTransferOpen] = useState(false);
  const [pulloutOpen, setPulloutOpen] = useState(false);
  const [returnRequestTarget, setReturnRequestTarget] = useState<ReturnTarget | null>(null);
  const [returnReviewTarget, setReturnReviewTarget] = useState<ReturnTarget | null>(null);
  const [receiveTarget, setReceiveTarget] = useState<ReceiveTarget | null>(null);
  const [deliverySelection, setDeliverySelection] = useState<RowSelectionState>({});
  const [transferSelection, setTransferSelection] = useState<RowSelectionState>({});
  const [pulloutSelection, setPulloutSelection] = useState<RowSelectionState>({});

  const deliverySort = useClientTableSort(deliveries, {
    branch: (d) => d.branch.name,
    reference: (d) => d.deliveryNo,
    status: (d) => d.statusCode.name,
  });
  const transferSort = useClientTableSort(transfers, {
    from: (t) => t.fromBranch.name,
    to: (t) => t.toBranch.name,
    status: (t) => t.statusCode.name,
  });
  const pulloutSort = useClientTableSort(pullouts, {
    branch: (p) => p.branch.name,
    status: (p) => p.statusCode.name,
  });

  function submitTransfer(input: {
    fromBranchId: string;
    toBranchId: string;
    modelId: string;
    quantity: number;
    serialNumberIds: string[];
    notes?: string;
    transferNo?: string;
  }) {
    return createTransferAction(input);
  }

  function submitPullout(input: {
    branchId: string;
    warehouseId: string;
    reasonStatusCodeId: string;
    lines: {
      serialNumberId: string;
      pulloutClassificationIds: string[];
      unitPackingConditionIds: string[];
      accessoryCompletenessIds: string[];
    }[];
  }) {
    return createPulloutAction(input);
  }

  const deliveryColumns = useMemo(() => {
    const cols: DataTableColumn<DeliveryRow>[] = [
      deliveryColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => row.index + 1,
        meta: { className: "tabular-nums text-muted-foreground" },
      }),
      deliveryColumn.display({
        id: "branch",
        header: "Branch",
        enableSorting: true,
        cell: ({ row }) => row.original.branch.name,
      }),
      deliveryColumn.display({
        id: "reference",
        header: "Reference",
        enableSorting: true,
        cell: ({ row }) => row.original.deliveryNo,
      }),
      deliveryColumn.display({
        id: "drNo",
        header: SAP_DOC_NO_LABEL,
        enableSorting: false,
        cell: ({ row }) =>
          formatSapDocNo(row.original.drNo, row.original.order?.sapDocType) ?? "—",
      }),
      deliveryColumn.display({
        id: "drDate",
        header: SAP_DOC_DATE_LABEL,
        enableSorting: false,
        cell: ({ row }) => formatInventoryDrDate(row.original.drDate),
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
        id: "return",
        header: "Return",
        enableSorting: false,
        cell: ({ row }) => <DeliveryReturnCell latest={row.original.returnRequests[0]} />,
      }),
      deliveryColumn.display({
        id: "actions",
        header: "Action",
        enableSorting: false,
        cell: ({ row }) => {
          const delivery = row.original;
          const receivable = RECEIVABLE_DELIVERY_CODES.has(delivery.statusCode.code);
          const latestReturn = delivery.returnRequests[0];
          const returnOpen = isReturnOpen(latestReturn);
          const target = { id: delivery.id, deliveryNo: delivery.deliveryNo, branchName: delivery.branch.name };
          return (
            <div className="flex flex-wrap justify-end gap-2">
              {receivable && !returnOpen && canRequestDeliveryReturn ? (
                <Button size="sm" variant="outline" onClick={() => setReturnRequestTarget(target)}>
                  Request return
                </Button>
              ) : null}
              {latestReturn?.status === "PENDING_APPROVAL" && canApproveDeliveryReturn ? (
                <Button size="sm" onClick={() => setReturnReviewTarget(target)}>
                  Review return
                </Button>
              ) : null}
              {needsSapRetry(latestReturn) && (canApproveDeliveryReturn || canRequestDeliveryReturn) ? (
                <Button size="sm" variant="outline" onClick={() => setReturnReviewTarget(target)}>
                  Retry SAP posting
                </Button>
              ) : null}
              {receivable && !returnOpen ? (
                <Button
                  size="sm"

                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={() => setReceiveTarget(target)}
                >
                  {delivery.statusCode.code === "partial" ? "Receive remaining" : "Receive"}
                </Button>
              ) : null}
            </div>
          );
        },
        meta: { align: "end" },
      }),
    ];
    return cols;
  }, [canApproveDeliveryReturn, canRequestDeliveryReturn]);

  const transferColumns = useMemo(() => {
    const cols: DataTableColumn<TransferRow>[] = [
      transferColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => row.index + 1,
        meta: { className: "tabular-nums text-muted-foreground" },
      }),
      transferColumn.display({
        id: "from",
        header: "From",
        enableSorting: true,
        cell: ({ row }) => row.original.fromBranch.name,
      }),
      transferColumn.display({
        id: "to",
        header: "To",
        enableSorting: true,
        cell: ({ row }) => row.original.toBranch.name,
      }),
      transferColumn.display({
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
    ];
    return cols;
  }, []);

  const pulloutColumns = useMemo(() => {
    const cols: DataTableColumn<PulloutRow>[] = [
      pulloutColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => row.index + 1,
        meta: { className: "tabular-nums text-muted-foreground" },
      }),
      pulloutColumn.display({
        id: "branch",
        header: "Branch",
        enableSorting: true,
        cell: ({ row }) => row.original.branch.name,
      }),
      pulloutColumn.display({
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
    ];
    return cols;
  }, []);

  return (
    <div className="space-y-8">
      <DataTable
        data={deliverySort.sorted}
        columns={deliveryColumns}
        getRowId={(row) => row.id}
        manualSorting
        enableSorting
        sorting={{
          sortKey: deliverySort.sortKey,
          sortDir: deliverySort.sortDir,
          onSort: deliverySort.toggleSort,
        }}
        enableRowSelection
        rowSelection={deliverySelection}
        onRowSelectionChange={setDeliverySelection}
        selectAllLabel="Select all deliveries"
        getSelectionLabel={(row) => `Select delivery ${row.deliveryNo}`}
        stickyHeader
        toolbarLeading={<h3 className="font-medium">Deliveries (accept DIT → Stock)</h3>}
        empty={deliverySort.sorted.length === 0}
        emptyMessage="No deliveries."
      />
      <DataTable
        data={transferSort.sorted}
        columns={transferColumns}
        getRowId={(row) => row.id}
        manualSorting
        enableSorting
        sorting={{
          sortKey: transferSort.sortKey,
          sortDir: transferSort.sortDir,
          onSort: transferSort.toggleSort,
        }}
        enableRowSelection
        rowSelection={transferSelection}
        onRowSelectionChange={setTransferSelection}
        selectAllLabel="Select all transfers"
        getSelectionLabel={(row) => `Select transfer ${row.id}`}
        stickyHeader
        toolbarLeading={<h3 className="font-medium">Branch transfers</h3>}
        toolbarActions={<Button size="sm" onClick={() => setTransferOpen(true)}>New transfer</Button>}
        empty={transferSort.sorted.length === 0}
        emptyMessage="No transfers."
      />

      <DataTable
        data={pulloutSort.sorted}
        columns={pulloutColumns}
        getRowId={(row) => row.id}
        manualSorting
        enableSorting
        sorting={{
          sortKey: pulloutSort.sortKey,
          sortDir: pulloutSort.sortDir,
          onSort: pulloutSort.toggleSort,
        }}
        enableRowSelection
        rowSelection={pulloutSelection}
        onRowSelectionChange={setPulloutSelection}
        selectAllLabel="Select all pull-outs"
        getSelectionLabel={(row) => `Select pull-out ${row.id}`}
        stickyHeader
        toolbarLeading={<h3 className="font-medium">Pull-outs</h3>}
        toolbarActions={<Button size="sm" onClick={() => setPulloutOpen(true)}>New pull-out</Button>}
        empty={pulloutSort.sorted.length === 0}
        emptyMessage="No pull-outs."
      />
      <TransferRequestDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        onSubmit={submitTransfer}
        onCreated={() => router.refresh()}
        currentUserName={currentUserName}
      />
      <PulloutRequestDialog
        open={pulloutOpen}
        onOpenChange={setPulloutOpen}
        onSubmit={submitPullout}
        onCreated={() => router.refresh()}
        currentUserName={currentUserName}
      />

      <DeliveryReceiveDialog
        target={receiveTarget}
        onClose={() => setReceiveTarget(null)}
        onReceived={() => router.refresh()}
        loadLines={listDeliveryReceiptLinesAction}
        accept={acceptDeliveryAction}
        canTransfer={canCreateDeliveryTransfer}
      />

      <DeliveryReturnRequestDialog
        target={returnRequestTarget}
        onClose={() => setReturnRequestTarget(null)}
        onDone={() => router.refresh()}
        submit={requestDeliveryReturnAction}
      />

      <DeliveryReturnReviewDialog
        target={returnReviewTarget}
        canApprove={canApproveDeliveryReturn}
        canRetry={canApproveDeliveryReturn || canRequestDeliveryReturn}
        actions={REVIEW_ACTIONS}
        onClose={() => setReturnReviewTarget(null)}
        onDone={() => router.refresh()}
      />
    </div>
  );
}
