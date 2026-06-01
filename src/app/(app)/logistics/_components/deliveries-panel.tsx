"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { acceptDeliveryAction } from "@/features/logistics/actions/logistics.actions";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import {
  DataTableScroll,
  DataTableShell,
} from "@/components/data-table/data-table-shell";
import { TablePagination } from "@/components/data-table/table-pagination";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  buildLogisticsPageHref,
  LOGISTICS_DELIVERIES_PATH,
} from "@/app/(app)/logistics/_components/logistics-paths";

interface StatusCodeRef {
  id: string;
  code: string;
  name: string;
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
}

type PendingConfirm = {
  id: string;
  deliveryNo: string;
  branchName: string;
  orderNumber?: string;
};

export function DeliveriesPanel({ deliveries }: DeliveriesPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

  function confirmPendingAction() {
    if (!pendingConfirm) return;
    startTransition(async () => {
      await acceptDeliveryAction(pendingConfirm.id);
      toast.success("Delivery accepted — DIT moved to Stock");
      setPendingConfirm(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <DataTableShell>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-medium">Deliveries</h3>
          <p className="text-sm text-muted-foreground">
            Created automatically when orders are approved (SAP ITR/SO sync).
          </p>
        </div>
        <DataTableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>No.</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveries.items.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>{d.deliveryNo}</TableCell>
                  <TableCell>{d.order?.orderNumber ?? "—"}</TableCell>
                  <TableCell>{d.branch.name}</TableCell>
                  <TableCell>
                    <StatusCodeBadge code={d.statusCode.code} name={d.statusCode.name} />
                  </TableCell>
                  <TableCell>
                    {d.statusCode.code === "pending" ? (
                      <Button
                        size="sm"
                        disabled={pending}
                        className="bg-emerald-600 text-white hover:bg-emerald-700"
                        onClick={() =>
                          setPendingConfirm({
                            id: d.id,
                            deliveryNo: d.deliveryNo,
                            branchName: d.branch.name,
                            orderNumber: d.order?.orderNumber,
                          })
                        }
                      >
                        Accept DIT
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataTableScroll>
        <TablePagination
          meta={{
            total: deliveries.total,
            page: deliveries.page,
            totalPages: deliveries.totalPages,
            itemLabel: "delivery",
          }}
          buildHref={(page) => buildLogisticsPageHref(LOGISTICS_DELIVERIES_PATH, page)}
        />
      </DataTableShell>

      <AlertDialog
        open={pendingConfirm !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setPendingConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Accept delivery?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingConfirm ? (
                <>
                  Confirm acceptance of{" "}
                  <span className="font-medium text-foreground">
                    {pendingConfirm.deliveryNo}
                  </span>
                  {pendingConfirm.orderNumber ? (
                    <> (order {pendingConfirm.orderNumber})</>
                  ) : null}{" "}
                  at {pendingConfirm.branchName}. DIT inventory will move to Stock.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={(event) => {
                event.preventDefault();
                confirmPendingAction();
              }}
            >
              Accept
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
