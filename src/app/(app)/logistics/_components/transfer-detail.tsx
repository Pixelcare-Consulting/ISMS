"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  approveTransferAction,
  executeTransferAction,
  receiveTransferAction,
  rejectTransferAction,
} from "@/features/logistics/actions/logistics.actions";
import type { TransferDetail } from "@/features/logistics/services/transfer-posting.service";
import type { LogisticsActionCapabilities } from "@/features/logistics/constants/logistics-permissions";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
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

function historyLabel(action: string): string {
  switch (action) {
    case "transfer.created":
      return "Request submitted";
    case "transfer.approved":
      return "Approved by Team Lead";
    case "transfer.rejected":
      return "Rejected";
    case "transfer.released":
      return "Released — in transit";
    case "transfer.received":
      return "Units received";
    default:
      return action;
  }
}

function inScope(scope: string[] | null, branchId: string): boolean {
  return scope === null || scope.includes(branchId);
}

export function TransferDetailView({
  detail,
  capabilities,
  branchScope,
}: {
  detail: TransferDetail;
  capabilities: LogisticsActionCapabilities;
  branchScope: string[] | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [receiveOpen, setReceiveOpen] = useState(false);
  const inTransit = detail.lines.filter(
    (line) => line.inventoryCode === "DIT" && line.branchId === detail.fromBranch.id,
  );
  const [selected, setSelected] = useState<string[]>(inTransit.map((line) => line.serialNumberId));
  const waiting =
    detail.status.code === "pending_tl" || detail.status.code === "requested";
  const releasable =
    detail.status.code === "for_transfer" || detail.status.code === "approved";

  function run(
    action: () => Promise<{ error: string } | { success: true }>,
    success: string,
  ) {
    startTransition(async () => {
      const result = await action();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(success);
      setReceiveOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/logistics/transfers" className="text-sm text-muted-foreground hover:underline">
            Back to transfers
          </Link>
          <h2 className="text-xl font-semibold">{detail.transferNo}</h2>
        </div>
        <StatusCodeBadge
          code={detail.status.code}
          name={detail.status.name}
          color={detail.status.color}
        />
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-muted-foreground">From</dt>
          <dd>{detail.fromBranch.name}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">To</dt>
          <dd>{detail.toBranch.name}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Model</dt>
          <dd>{detail.model ? `${detail.model.skuCode} — ${detail.model.name}` : "—"}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Quantity</dt>
          <dd>{detail.lines.reduce((sum, line) => sum + line.quantity, 0)}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-sm text-muted-foreground">Reason</dt>
          <dd>{detail.notes || "—"}</dd>
        </div>
      </dl>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Serial</th>
              <th className="px-3 py-2 font-medium">Model</th>
              <th className="px-3 py-2 font-medium">Qty</th>
              <th className="px-3 py-2 font-medium">Held as</th>
              <th className="px-3 py-2 font-medium">Now</th>
            </tr>
          </thead>
          <tbody>
            {detail.lines.map((line) => (
              <tr key={line.serialNumberId} className="border-t">
                <td className="px-3 py-2 font-mono">{line.serialNo}</td>
                <td className="px-3 py-2">{line.skuCode}</td>
                <td className="px-3 py-2">{line.quantity}</td>
                <td className="px-3 py-2">{line.priorCode ?? "—"}</td>
                <td className="px-3 py-2">
                  {line.inventoryCode ?? "—"}
                  {line.branchName ? ` · ${line.branchName}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2">
        {waiting && capabilities.canApproveTl ? (
          <Button
            disabled={pending}
            className="bg-amber-600 text-white hover:bg-amber-700"
            onClick={() => run(() => approveTransferAction(detail.id), "Transfer approved for release")}
          >
            TL approve
          </Button>
        ) : null}
        {waiting && capabilities.canRejectTransfer ? (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => run(() => rejectTransferAction(detail.id), "Transfer rejected")}
          >
            Reject
          </Button>
        ) : null}
        {releasable && capabilities.canExecuteTransfer && inScope(branchScope, detail.fromBranch.id) ? (
          <Button
            disabled={pending}
            onClick={() =>
              run(() => executeTransferAction(detail.id), "Transfer released — units are in transit")
            }
          >
            Release
          </Button>
        ) : null}
        {detail.status.code === "in_transit" &&
        capabilities.canReceiveTransfer &&
        inScope(branchScope, detail.toBranch.id) ? (
          <Button
            disabled={pending || inTransit.length === 0}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={() => {
              setSelected(inTransit.map((line) => line.serialNumberId));
              setReceiveOpen(true);
            }}
          >
            Receive
          </Button>
        ) : null}
      </div>

      <section className="space-y-2">
        <h3 className="font-medium">History</h3>
        {detail.history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No history yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {detail.history.map((row) => (
              <li key={row.id}>
                {historyLabel(row.action)}
                {row.userName ? ` · ${row.userName}` : ""} · {new Date(row.at).toLocaleString()}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog open={receiveOpen} onOpenChange={(open) => !pending && setReceiveOpen(open)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Receive {detail.transferNo}</DialogTitle>
            <DialogDescription>
              Tick only the serials that arrived. The rest stay in transit, and this transfer stays
              in transit until every serial is received.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {inTransit.length === 0 ? (
              <p className="text-sm text-muted-foreground">No serials are still in transit.</p>
            ) : (
              inTransit.map((line) => (
                <label
                  key={line.serialNumberId}
                  className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
                >
                  <Checkbox
                    checked={selected.includes(line.serialNumberId)}
                    onCheckedChange={(value) => {
                      setSelected((current) =>
                        value === true
                          ? [...current, line.serialNumberId]
                          : current.filter((id) => id !== line.serialNumberId),
                      );
                    }}
                    aria-label={`Receive ${line.serialNo}`}
                  />
                  <span className="font-mono">{line.serialNo}</span>
                  <span className="text-muted-foreground">{line.priorCode ?? line.inventoryCode}</span>
                </label>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setReceiveOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={pending || selected.length === 0}
              onClick={() =>
                run(
                  () => receiveTransferAction(detail.id, { serialNumberIds: selected }),
                  "Received the serials you confirmed",
                )
              }
            >
              Receive {selected.length}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
