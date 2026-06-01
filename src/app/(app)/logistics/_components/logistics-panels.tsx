"use client";



import { useRouter } from "next/navigation";

import { useState, useTransition } from "react";

import { toast } from "sonner";



import {

  acceptDeliveryAction,

  approveTransferAction,

  createDeliveryAction,

  createPulloutAction,

  createTransferAction,

  listBranchesForLogisticsAction,

  listPulloutReasonCodesAction,

  listWarehousesForLogisticsAction,

} from "@/features/logistics/actions/logistics.actions";

import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";

import {

  DataTableScroll,

  DataTableShell,

} from "@/components/data-table/data-table-shell";

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

  Table,

  TableBody,

  TableCell,

  TableHead,

  TableHeader,

  TableRow,

} from "@/components/ui/table";



interface StatusCodeRef {

  id: string;

  code: string;

  name: string;

}



interface LogisticsPanelsProps {

  deliveries: {

    id: string;

    deliveryNo: string;

    statusCode: StatusCodeRef;

    branch: { name: string };

  }[];

  transfers: {

    id: string;

    transferNo: string;

    statusCode: StatusCodeRef;

    fromBranch: { name: string };

    toBranch: { name: string };

  }[];

  pullouts: {

    id: string;

    pulloutNo: string;

    statusCode: StatusCodeRef;

    reasonStatusCode: StatusCodeRef | null;

    branch: { name: string };

    warehouse: { name: string; code: string };

  }[];

}



type PendingConfirm =

  | {

      kind: "accept_delivery";

      id: string;

      deliveryNo: string;

      branchName: string;

    }

  | {

      kind: "approve_transfer";

      id: string;

      transferNo: string;

      route: string;

    };



export function LogisticsPanels({

  deliveries,

  transfers,

  pullouts,

}: LogisticsPanelsProps) {

  const router = useRouter();

  const [pending, startTransition] = useTransition();

  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);

  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);

  const [pulloutReasons, setPulloutReasons] = useState<StatusCodeRef[]>([]);

  const [selectedReasonId, setSelectedReasonId] = useState("");

  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);



  async function loadRefs() {

    const [b, w, reasons] = await Promise.all([

      listBranchesForLogisticsAction(),

      listWarehousesForLogisticsAction(),

      listPulloutReasonCodesAction(),

    ]);

    setBranches(b);

    setWarehouses(w);

    setPulloutReasons(reasons.map((r: { id: string; code: string; name: string }) => ({ id: r.id, code: r.code, name: r.name })));

    if (reasons[0]) setSelectedReasonId(reasons[0].id);

  }



  function confirmPendingAction() {

    if (!pendingConfirm) return;

    startTransition(async () => {

      if (pendingConfirm.kind === "accept_delivery") {

        await acceptDeliveryAction(pendingConfirm.id);

        toast.success("Delivery accepted — DIT moved to Stock");

      } else {

        await approveTransferAction(pendingConfirm.id);

        toast.success("Transfer approved");

      }

      setPendingConfirm(null);

      router.refresh();

    });

  }



  return (

    <div className="space-y-8">

      <Button variant="outline" type="button" onClick={loadRefs}>

        Load branches & warehouses

      </Button>



      <DataTableShell>

        <div className="flex items-center justify-between border-b px-4 py-3">

          <h3 className="font-medium">Deliveries</h3>

          {branches[0] ? (

            <Button

              size="sm"

              disabled={pending}

              onClick={() =>

                startTransition(async () => {

                  await createDeliveryAction({ branchId: branches[0].id });

                  router.refresh();

                })

              }

            >

              New delivery (first branch)

            </Button>

          ) : null}

        </div>

        <DataTableScroll>

          <Table>

            <TableHeader>

              <TableRow>

                <TableHead>No.</TableHead>

                <TableHead>Branch</TableHead>

                <TableHead>Status</TableHead>

                <TableHead />

              </TableRow>

            </TableHeader>

            <TableBody>

              {deliveries.map((d) => (

                <TableRow key={d.id}>

                  <TableCell>{d.deliveryNo}</TableCell>

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
                            kind: "accept_delivery",
                            id: d.id,
                            deliveryNo: d.deliveryNo,
                            branchName: d.branch.name,
                          })
                        }
                      >

                        Accept

                      </Button>

                    ) : null}

                  </TableCell>

                </TableRow>

              ))}

            </TableBody>

          </Table>

        </DataTableScroll>

      </DataTableShell>



      <DataTableShell>

        <div className="flex items-center justify-between border-b px-4 py-3">

          <h3 className="font-medium">Transfers</h3>

          {branches.length >= 2 ? (

            <Button

              size="sm"

              disabled={pending}

              onClick={() =>

                startTransition(async () => {

                  await createTransferAction({

                    fromBranchId: branches[0].id,

                    toBranchId: branches[1].id,

                  });

                  router.refresh();

                })

              }

            >

              New transfer

            </Button>

          ) : null}

        </div>

        <DataTableScroll>

          <Table>

            <TableHeader>

              <TableRow>

                <TableHead>No.</TableHead>

                <TableHead>From → To</TableHead>

                <TableHead>Status</TableHead>

                <TableHead />

              </TableRow>

            </TableHeader>

            <TableBody>

              {transfers.map((t) => (

                <TableRow key={t.id}>

                  <TableCell>{t.transferNo}</TableCell>

                  <TableCell>

                    {t.fromBranch.name} → {t.toBranch.name}

                  </TableCell>

                  <TableCell>

                    <StatusCodeBadge code={t.statusCode.code} name={t.statusCode.name} />

                  </TableCell>

                  <TableCell>

                    {t.statusCode.code === "pending_tl" ? (

                      <Button
                        size="sm"
                        disabled={pending}
                        className="bg-amber-600 text-white hover:bg-amber-700"
                        onClick={() =>
                          setPendingConfirm({
                            kind: "approve_transfer",
                            id: t.id,
                            transferNo: t.transferNo,
                            route: `${t.fromBranch.name} → ${t.toBranch.name}`,
                          })
                        }
                      >

                        TL approve

                      </Button>

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

          <h3 className="font-medium">Pull-outs</h3>

          <div className="flex flex-wrap items-center gap-2">

            {pulloutReasons.length > 0 ? (

              <select

                className="h-9 rounded-md border px-2 text-sm"

                value={selectedReasonId}

                onChange={(e) => setSelectedReasonId(e.target.value)}

              >

                {pulloutReasons.map((r) => (

                  <option key={r.id} value={r.id}>

                    {r.name} ({r.code})

                  </option>

                ))}

              </select>

            ) : null}

            {branches[0] && warehouses[0] ? (

              <Button

                size="sm"

                disabled={pending}

                onClick={() =>

                  startTransition(async () => {

                    await createPulloutAction({

                      branchId: branches[0].id,

                      warehouseId: warehouses[0].id,

                      reasonStatusCodeId: selectedReasonId || undefined,

                    });

                    router.refresh();

                  })

                }

              >

                New pull-out

              </Button>

            ) : null}

          </div>

        </div>

        <DataTableScroll>

          <Table>

            <TableHeader>

              <TableRow>

                <TableHead>No.</TableHead>

                <TableHead>Branch</TableHead>

                <TableHead>Warehouse</TableHead>

                <TableHead>Reason</TableHead>

                <TableHead>Status</TableHead>

              </TableRow>

            </TableHeader>

            <TableBody>

              {pullouts.map((p) => (

                <TableRow key={p.id}>

                  <TableCell>{p.pulloutNo}</TableCell>

                  <TableCell>{p.branch.name}</TableCell>

                  <TableCell>{p.warehouse.name}</TableCell>

                  <TableCell>

                    {p.reasonStatusCode ? (

                      <StatusCodeBadge

                        code={p.reasonStatusCode.code}

                        name={p.reasonStatusCode.name}

                      />

                    ) : (

                      "—"

                    )}

                  </TableCell>

                  <TableCell>

                    <StatusCodeBadge code={p.statusCode.code} name={p.statusCode.name} />

                  </TableCell>

                </TableRow>

              ))}

            </TableBody>

          </Table>

        </DataTableScroll>

      </DataTableShell>

      <AlertDialog
        open={pendingConfirm !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setPendingConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingConfirm?.kind === "accept_delivery"
                ? "Accept delivery?"
                : "Approve transfer?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingConfirm?.kind === "accept_delivery" ? (
                <>
                  Confirm acceptance of{" "}
                  <span className="font-medium text-foreground">
                    {pendingConfirm.deliveryNo}
                  </span>{" "}
                  at {pendingConfirm.branchName}. DIT inventory will move to Stock.
                </>
              ) : pendingConfirm?.kind === "approve_transfer" ? (
                <>
                  Approve transfer{" "}
                  <span className="font-medium text-foreground">
                    {pendingConfirm.transferNo}
                  </span>{" "}
                  ({pendingConfirm.route}) as team lead?
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              className={
                pendingConfirm?.kind === "accept_delivery"
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "bg-amber-600 text-white hover:bg-amber-700"
              }
              onClick={(event) => {
                event.preventDefault();
                confirmPendingAction();
              }}
            >
              {pendingConfirm?.kind === "accept_delivery" ? "Accept" : "Approve"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>

  );

}


