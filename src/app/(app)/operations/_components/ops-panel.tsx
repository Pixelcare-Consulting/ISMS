"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createColumnHelper, type RowSelectionState } from "@tanstack/react-table";
import { toast } from "sonner";

import {
  DeliveryReceiveDialog,
  type ReceiveTarget,
} from "@/app/(app)/logistics/_components/delivery-receive-dialog";
import { PulloutRequestDialog } from "@/app/(app)/logistics/_components/pullout-request-dialog";
import { TransferRequestDialog } from "@/app/(app)/logistics/_components/transfer-request-dialog";
import {
  acceptDeliveryAction,
  createPulloutAction,
  createTransferAction,
  listDeliveryReceiptLinesAction,
  rejectDeliveryAction,
} from "@/features/ops/actions/ops.actions";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import { Button } from "@/components/ui/button";
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
  deliveries: {
    id: string;
    deliveryNo: string;
    statusCode: StatusCodeRef;
    branch: { name: string };
  }[];
  transfers: {
    id: string;
    statusCode: StatusCodeRef;
    fromBranch: { name: string };
    toBranch: { name: string };
  }[];
  pullouts: { id: string; statusCode: StatusCodeRef; branch: { name: string } }[];
}

type DeliveryRow = OpsPanelProps["deliveries"][number];
type TransferRow = OpsPanelProps["transfers"][number];
type PulloutRow = OpsPanelProps["pullouts"][number];

const deliveryColumn = createColumnHelper<DataTableFeatures, DeliveryRow>();
const transferColumn = createColumnHelper<DataTableFeatures, TransferRow>();
const pulloutColumn = createColumnHelper<DataTableFeatures, PulloutRow>();

interface PendingDeliveryReject {
  id: string;
  deliveryNo: string;
  branchName: string;
}

/** Dispatched deliveries the branch can still receive or reject. */
const RECEIVABLE_DELIVERY_CODES = new Set(["pending", "partial"]);

export function OpsPanel({ deliveries, transfers, pullouts }: OpsPanelProps) {
  const router = useRouter();
  const [transferOpen, setTransferOpen] = useState(false);
  const [pulloutOpen, setPulloutOpen] = useState(false);
  const [pendingDelivery, setPendingDelivery] = useState<PendingDeliveryReject | null>(
    null,
  );
  const [receiveTarget, setReceiveTarget] = useState<ReceiveTarget | null>(null);
  const [pending, startTransition] = useTransition();
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

  function confirmDeliveryAction() {
    if (!pendingDelivery) return;
    const { id } = pendingDelivery;
    startTransition(async () => {
      const result = await rejectDeliveryAction(id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Delivery rejected");
      setPendingDelivery(null);
      router.refresh();
    });
  }

  function submitTransfer(input: {
    fromBranchId: string;
    toBranchId: string;
    modelId: string;
    quantity: number;
    serialNumberIds: string[];
    notes?: string;
  }) {
    return createTransferAction(input);
  }

  function submitPullout(input: {
    branchId: string;
    warehouseId: string;
    reasonStatusCodeId: string;
    serialNumberIds: string[];
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
        header: "Action",
        enableSorting: false,
        cell: ({ row }) =>
          RECEIVABLE_DELIVERY_CODES.has(row.original.statusCode.code) ? (
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  setPendingDelivery({
                    id: row.original.id,
                    deliveryNo: row.original.deliveryNo,
                    branchName: row.original.branch.name,
                  })
                }
              >
                Reject
              </Button>
              <Button
                size="sm"
                disabled={pending}
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={() =>
                  setReceiveTarget({
                    id: row.original.id,
                    deliveryNo: row.original.deliveryNo,
                    branchName: row.original.branch.name,
                  })
                }
              >
                {row.original.statusCode.code === "partial" ? "Receive remaining" : "Receive"}
              </Button>
            </div>
          ) : null,
        meta: { align: "end" },
      }),
    ];
    return cols;
  }, [pending]);

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
      />
      <PulloutRequestDialog
        open={pulloutOpen}
        onOpenChange={setPulloutOpen}
        onSubmit={submitPullout}
        onCreated={() => router.refresh()}
      />

      <DeliveryReceiveDialog
        target={receiveTarget}
        onClose={() => setReceiveTarget(null)}
        onReceived={() => router.refresh()}
        loadLines={listDeliveryReceiptLinesAction}
        accept={acceptDeliveryAction}
      />

      <AlertDialog
        open={pendingDelivery !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setPendingDelivery(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject delivery?</AlertDialogTitle>
            <AlertDialogDescription>
              Reject{" "}
              <span className="font-medium text-foreground">{pendingDelivery?.deliveryNo}</span> at{" "}
              {pendingDelivery?.branchName}. Serials still in transit go back to the warehouse.
              Units already accepted stay at the branch.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                confirmDeliveryAction();
              }}
            >
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
