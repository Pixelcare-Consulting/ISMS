"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import {
  acceptDeliveryAction,
  createPulloutAction,
  createTransferAction,
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
  branches: { id: string; name: string }[];
}

interface PendingAccept {
  id: string;
  deliveryNo: string;
  branchName: string;
}

export function OpsPanel({ deliveries, transfers, pullouts, branches }: OpsPanelProps) {
  const router = useRouter();
  const [transferOpen, setTransferOpen] = useState(false);
  const [pulloutOpen, setPulloutOpen] = useState(false);
  const [pendingAccept, setPendingAccept] = useState<PendingAccept | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmAccept() {
    if (!pendingAccept) return;
    startTransition(async () => {
      const result = await acceptDeliveryAction(pendingAccept.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Delivery accepted — DIT moved to stock");
      setPendingAccept(null);
      router.refresh();
    });
  }

  function submitTransfer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createTransferAction(formData);
      if (result.error) { toast.error(result.error); return; }
      toast.success("Transfer created");
      setTransferOpen(false);
      router.refresh();
    });
  }

  function submitPullout(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createPulloutAction(formData);
      if (result.error) { toast.error(result.error); return; }
      toast.success("Pull-out created");
      setPulloutOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <DataTableShell>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-medium">Deliveries (accept DIT → Stock)</h3>
        </div>
        <DataTableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Branch</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveries.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>{d.branch.name}</TableCell>
                  <TableCell>{d.deliveryNo}</TableCell>
                  <TableCell>
                    <StatusCodeBadge code={d.statusCode.code} name={d.statusCode.name} />
                  </TableCell>
                  <TableCell className="text-right">
                    {d.statusCode.code === "pending" ? (
                      <Button
                        size="sm"
                        disabled={pending}
                        className="bg-emerald-600 text-white hover:bg-emerald-700"
                        onClick={() =>
                          setPendingAccept({
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
          <h3 className="font-medium">Branch transfers</h3>
          <Button size="sm" onClick={() => setTransferOpen(true)}>New transfer</Button>
        </div>
        <DataTableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfers.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{t.fromBranch.name}</TableCell>
                  <TableCell>{t.toBranch.name}</TableCell>
                  <TableCell>
                    <StatusCodeBadge code={t.statusCode.code} name={t.statusCode.name} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataTableScroll>
      </DataTableShell>

      <DataTableShell>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-medium">Pull-outs</h3>
          <Button size="sm" onClick={() => setPulloutOpen(true)}>New pull-out</Button>
        </div>
        <DataTableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Branch</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pullouts.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.branch.name}</TableCell>
                  <TableCell>
                    <StatusCodeBadge code={p.statusCode.code} name={p.statusCode.name} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataTableScroll>
      </DataTableShell>

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New branch transfer</DialogTitle></DialogHeader>
          <form onSubmit={submitTransfer} className="space-y-4">
            <div className="space-y-2">
              <Label>From branch</Label>
              <select name="fromBranchId" required className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm">
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>To branch</Label>
              <select name="toBranchId" required className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm">
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <DialogFooter><Button type="submit" disabled={pending}>Create</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={pulloutOpen} onOpenChange={setPulloutOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New pull-out</DialogTitle></DialogHeader>
          <form onSubmit={submitPullout} className="space-y-4">
            <div className="space-y-2">
              <Label>Branch</Label>
              <select name="branchId" required className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm">
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <DialogFooter><Button type="submit" disabled={pending}>Create</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingAccept !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setPendingAccept(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Accept delivery?</AlertDialogTitle>
            <AlertDialogDescription>
              Confirm acceptance of{" "}
              <span className="font-medium text-foreground">
                {pendingAccept?.deliveryNo}
              </span>{" "}
              at {pendingAccept?.branchName}. DIT inventory will move to Stock.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={(event) => {
                event.preventDefault();
                confirmAccept();
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
