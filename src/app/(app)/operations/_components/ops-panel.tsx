"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { PulloutRequestDialog } from "@/app/(app)/logistics/_components/pullout-request-dialog";
import { TransferRequestDialog } from "@/app/(app)/logistics/_components/transfer-request-dialog";
import {
  acceptDeliveryAction,
  createPulloutAction,
  createTransferAction,
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
  DataTableScroll,
  DataTableShell,
} from "@/components/data-table/data-table-shell";
import { useTableSelection } from "@/components/data-table/use-table-selection";
import { GlobalTableHead, useClientTableSort } from "@/lib/data-table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useState } from "react";

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

interface PendingDeliveryAction {
  id: string;
  deliveryNo: string;
  branchName: string;
  action: "accept" | "reject";
}

export function OpsPanel({ deliveries, transfers, pullouts }: OpsPanelProps) {
  const router = useRouter();
  const [transferOpen, setTransferOpen] = useState(false);
  const [pulloutOpen, setPulloutOpen] = useState(false);
  const [pendingDelivery, setPendingDelivery] = useState<PendingDeliveryAction | null>(
    null,
  );
  const [pending, startTransition] = useTransition();
  const deliverySelection = useTableSelection(deliveries.map((delivery) => delivery.id));
  const transferSelection = useTableSelection(transfers.map((transfer) => transfer.id));
  const pulloutSelection = useTableSelection(pullouts.map((pullout) => pullout.id));

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
    const { action, id } = pendingDelivery;
    startTransition(async () => {
      const result =
        action === "accept"
          ? await acceptDeliveryAction(id)
          : await rejectDeliveryAction(id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        action === "accept"
          ? "movedCount" in result && result.movedCount
            ? "Delivery accepted — DIT moved to stock"
            : "Delivery accepted"
          : "Delivery rejected",
      );
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

  return (
    <div className="space-y-8">
      <DataTableShell>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <h3 className="font-medium">Deliveries (accept DIT → Stock)</h3>
        </div>
        <DataTableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={deliverySelection.isAllSelected || (deliverySelection.isPartiallySelected ? "indeterminate" : false)}
                    onCheckedChange={(checked) => deliverySelection.toggleAll(checked === true)}
                    aria-label="Select all deliveries"
                  />
                </TableHead>
                <TableHead className="w-12">#</TableHead>
                <GlobalTableHead {...deliverySort.sortProps("branch")}>Branch</GlobalTableHead>
                <GlobalTableHead {...deliverySort.sortProps("reference")}>Reference</GlobalTableHead>
                <GlobalTableHead {...deliverySort.sortProps("status")}>Status</GlobalTableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliverySort.sorted.map((d, index) => (
                <TableRow key={d.id} data-state={deliverySelection.isRowSelected(d.id) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={deliverySelection.isRowSelected(d.id)}
                      onCheckedChange={(checked) => deliverySelection.toggleRow(d.id, checked === true)}
                      aria-label={`Select delivery ${d.deliveryNo}`}
                    />
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{index + 1}</TableCell>
                  <TableCell>{d.branch.name}</TableCell>
                  <TableCell>{d.deliveryNo}</TableCell>
                  <TableCell>
                    <StatusCodeBadge
                      code={d.statusCode.code}
                      name={d.statusCode.name}
                      color={d.statusCode.color}
                    />
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    {d.statusCode.code === "pending" ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() =>
                            setPendingDelivery({
                              id: d.id,
                              deliveryNo: d.deliveryNo,
                              branchName: d.branch.name,
                              action: "reject",
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
                            setPendingDelivery({
                              id: d.id,
                              deliveryNo: d.deliveryNo,
                              branchName: d.branch.name,
                              action: "accept",
                            })
                          }
                        >
                          Accept
                        </Button>
                      </>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataTableScroll>
      </DataTableShell>

      <DataTableShell>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <h3 className="font-medium">Branch transfers</h3>
          <Button size="sm" onClick={() => setTransferOpen(true)}>New transfer</Button>
        </div>
        <DataTableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={transferSelection.isAllSelected || (transferSelection.isPartiallySelected ? "indeterminate" : false)}
                    onCheckedChange={(checked) => transferSelection.toggleAll(checked === true)}
                    aria-label="Select all transfers"
                  />
                </TableHead>
                <TableHead className="w-12">#</TableHead>
                <GlobalTableHead {...transferSort.sortProps("from")}>From</GlobalTableHead>
                <GlobalTableHead {...transferSort.sortProps("to")}>To</GlobalTableHead>
                <GlobalTableHead {...transferSort.sortProps("status")}>Status</GlobalTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transferSort.sorted.map((t, index) => (
                <TableRow key={t.id} data-state={transferSelection.isRowSelected(t.id) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={transferSelection.isRowSelected(t.id)}
                      onCheckedChange={(checked) => transferSelection.toggleRow(t.id, checked === true)}
                      aria-label={`Select transfer ${t.id}`}
                    />
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{index + 1}</TableCell>
                  <TableCell>{t.fromBranch.name}</TableCell>
                  <TableCell>{t.toBranch.name}</TableCell>
                  <TableCell>
                    <StatusCodeBadge
                      code={t.statusCode.code}
                      name={t.statusCode.name}
                      color={t.statusCode.color}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataTableScroll>
      </DataTableShell>

      <DataTableShell>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <h3 className="font-medium">Pull-outs</h3>
          <Button size="sm" onClick={() => setPulloutOpen(true)}>New pull-out</Button>
        </div>
        <DataTableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={pulloutSelection.isAllSelected || (pulloutSelection.isPartiallySelected ? "indeterminate" : false)}
                    onCheckedChange={(checked) => pulloutSelection.toggleAll(checked === true)}
                    aria-label="Select all pull-outs"
                  />
                </TableHead>
                <TableHead className="w-12">#</TableHead>
                <GlobalTableHead {...pulloutSort.sortProps("branch")}>Branch</GlobalTableHead>
                <GlobalTableHead {...pulloutSort.sortProps("status")}>Status</GlobalTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pulloutSort.sorted.map((p, index) => (
                <TableRow key={p.id} data-state={pulloutSelection.isRowSelected(p.id) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={pulloutSelection.isRowSelected(p.id)}
                      onCheckedChange={(checked) => pulloutSelection.toggleRow(p.id, checked === true)}
                      aria-label={`Select pull-out ${p.id}`}
                    />
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{index + 1}</TableCell>
                  <TableCell>{p.branch.name}</TableCell>
                  <TableCell>
                    <StatusCodeBadge
                      code={p.statusCode.code}
                      name={p.statusCode.name}
                      color={p.statusCode.color}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataTableScroll>
      </DataTableShell>

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

      <AlertDialog
        open={pendingDelivery !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setPendingDelivery(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDelivery?.action === "reject" ? "Reject delivery?" : "Accept delivery?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelivery?.action === "reject" ? (
                <>
                  Reject{" "}
                  <span className="font-medium text-foreground">
                    {pendingDelivery.deliveryNo}
                  </span>{" "}
                  at {pendingDelivery.branchName}. DIT inventory is unchanged.
                </>
              ) : (
                <>
                  Confirm acceptance of{" "}
                  <span className="font-medium text-foreground">
                    {pendingDelivery?.deliveryNo}
                  </span>{" "}
                  at {pendingDelivery?.branchName}. DIT inventory will move to Stock.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              className={
                pendingDelivery?.action === "reject"
                  ? undefined
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              }
              onClick={(event) => {
                event.preventDefault();
                confirmDeliveryAction();
              }}
            >
              {pendingDelivery?.action === "reject" ? "Reject" : "Accept"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
