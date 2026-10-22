"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  DeliveryTransferCreateDialog,
  type TransferRequest,
} from "@/app/(app)/logistics/_components/delivery-transfer-create-dialog";
import type { DeliveryReceiptLine } from "@/features/logistics/services/delivery-posting.service";
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

export interface ReceiveTarget {
  id: string;
  deliveryNo: string;
  branchName: string;
}

type LoadLinesResult =
  | { success: true; status: string; lines: DeliveryReceiptLine[] }
  | { error: string };

type AcceptResult =
  | { success: true; movedCount: number; status: "accepted" | "partial" }
  | { error: string };

interface DeliveryReceiveDialogProps {
  target: ReceiveTarget | null;
  onClose: () => void;
  /** Called after a successful accept so the list can refresh. */
  onReceived: () => void;
  loadLines: (deliveryId: string) => Promise<LoadLinesResult>;
  accept: (deliveryId: string, input: { serialNumberIds: string[] }) => Promise<AcceptResult>;
  /** Shows the Transfer actions (logistics.delivery_transfer.create). */
  canTransfer?: boolean;
}

/**
 * Branch receipt of a dispatched delivery. A first receipt ticks which units
 * arrived; unticked units stay in transit or go on a unit transfer. A partial
 * delivery lists the units still in transit with a per-unit accept / transfer.
 * Units already on an open transfer are settled there, not here.
 */
export function DeliveryReceiveDialog({
  target,
  onClose,
  onReceived,
  loadLines,
  accept,
  canTransfer = false,
}: DeliveryReceiveDialogProps) {
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        {target ? (
          // Keyed so each delivery starts with a fresh load and selection.
          <ReceiveBody
            key={target.id}
            target={target}
            onClose={onClose}
            onReceived={onReceived}
            loadLines={loadLines}
            accept={accept}
            canTransfer={canTransfer}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; status: string; lines: DeliveryReceiptLine[] };

function ReceiveBody({
  target,
  onClose,
  onReceived,
  loadLines,
  accept,
  canTransfer,
}: DeliveryReceiveDialogProps & { target: ReceiveTarget }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [selected, setSelected] = useState<string[]>([]);
  const [transferRequest, setTransferRequest] = useState<TransferRequest | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    loadLines(target.id).then((result) => {
      if (cancelled) return;
      if ("error" in result) {
        setState({ kind: "error", message: result.error });
        return;
      }
      setState({ kind: "ready", status: result.status, lines: result.lines });
      setSelected(
        result.lines
          .filter((line) => line.state === "IN_TRANSIT")
          .map((line) => line.serialNumberId),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [loadLines, target.id, reloadKey]);

  const lines = state.kind === "ready" ? state.lines : [];
  // In transit and free to act on here; units on an open transfer, or gone on one, are listed apart.
  const inTransit = lines.filter((line) => line.state === "IN_TRANSIT");
  const onTransfer = lines.filter((line) => line.state === "ON_TRANSFER");
  const received = lines.filter((line) => line.state === "RECEIVED");
  const transferred = lines.filter((line) => line.state === "TRANSFERRED");
  const isPartial = state.kind === "ready" && state.status === "partial";
  const unticked = inTransit.filter((line) => !selected.includes(line.serialNumberId));

  function openTransfer(units: DeliveryReceiptLine[]) {
    setTransferRequest({ deliveryId: target.id, deliveryNo: target.deliveryNo, units });
  }

  /** A per-unit accept keeps the dialog open on the refreshed list. */
  function submitAccept(serialNumberIds: string[], keepOpen = false) {
    startTransition(async () => {
      const result = await accept(target.id, { serialNumberIds });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      const units = `${result.movedCount} serial${result.movedCount === 1 ? "" : "s"}`;
      toast.success(
        result.status === "partial"
          ? `Accepted ${units}. The rest stay in transit.`
          : `Accepted ${units} into branch stock.`,
      );
      onReceived();
      if (keepOpen && result.status === "partial") {
        setReloadKey((key) => key + 1);
        return;
      }
      onClose();
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Receive {target.deliveryNo}</DialogTitle>
        <DialogDescription>
          {isPartial
            ? `Part of this delivery is already in ${target.branchName} stock. Review the units that have not been received.`
            : `Tick the units that arrived at ${target.branchName}. Unticked units stay in transit until they are accepted or put on a unit transfer.`}
        </DialogDescription>
      </DialogHeader>

      {state.kind === "loading" ? (
        <p className="text-sm text-muted-foreground">Loading delivery serials…</p>
      ) : state.kind === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      ) : isPartial ? (
        <div className="max-h-96 space-y-4 overflow-y-auto">
          <section className="space-y-2">
            <h3 className="text-sm font-medium">Not received ({inTransit.length})</h3>
            {inTransit.length === 0 ? (
              <p className="text-sm text-muted-foreground">Every unit has been received.</p>
            ) : (
              <ul className="space-y-2">
                {inTransit.map((line) => (
                  <li
                    key={line.serialNumberId}
                    className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <SerialLabel line={line} />
                    <div className="ml-auto flex gap-2">
                      {canTransfer ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="max-sm:h-11"
                          disabled={pending}
                          onClick={() => openTransfer([line])}
                        >
                          Transfer
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        disabled={pending}
                        className="bg-emerald-600 text-white hover:bg-emerald-700 max-sm:h-11"
                        onClick={() => submitAccept([line.serialNumberId], true)}
                      >
                        Accept
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <OnTransferSection lines={onTransfer} />
          <DoneSection title="Received" lines={received} />
          <DoneSection title="Transferred" lines={transferred} />
        </div>
      ) : inTransit.length === 0 ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">No units on this delivery are waiting to be received.</p>
          <OnTransferSection lines={onTransfer} />
          <DoneSection title="Transferred" lines={transferred} />
        </div>
      ) : (
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {inTransit.map((line) => {
            const checked = selected.includes(line.serialNumberId);
            return (
              <label
                key={line.serialNumberId}
                className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(value) => {
                    setSelected((current) =>
                      value === true
                        ? [...current, line.serialNumberId]
                        : current.filter((id) => id !== line.serialNumberId),
                    );
                  }}
                  aria-label={`Received ${line.serialNo}`}
                />
                <SerialLabel line={line} />
              </label>
            );
          })}
          <OnTransferSection lines={onTransfer} />
        </div>
      )}

      <DialogFooter className="flex-wrap gap-2">
        <Button variant="outline" className="max-sm:h-11" disabled={pending} onClick={onClose}>
          Cancel
        </Button>
        {state.kind === "ready" && !isPartial && canTransfer && unticked.length > 0 ? (
          <Button
            variant="outline"
            className="max-sm:h-11"
            disabled={pending}
            onClick={() => openTransfer(unticked)}
          >
            Transfer unticked units ({unticked.length})
          </Button>
        ) : null}
        {state.kind === "ready" && inTransit.length > 0 ? (
          isPartial ? (
            <Button
              disabled={pending}
              className="bg-emerald-600 text-white hover:bg-emerald-700 max-sm:h-11"
              onClick={() => submitAccept(inTransit.map((line) => line.serialNumberId))}
            >
              Accept all remaining ({inTransit.length})
            </Button>
          ) : (
            <Button
              disabled={pending || selected.length === 0}
              className="bg-emerald-600 text-white hover:bg-emerald-700 max-sm:h-11"
              onClick={() => submitAccept(selected)}
            >
              Accept {selected.length} of {inTransit.length}
            </Button>
          )
        ) : null}
      </DialogFooter>

      <DeliveryTransferCreateDialog request={transferRequest} onClose={() => setTransferRequest(null)} />
    </>
  );
}

function SerialLabel({ line }: { line: DeliveryReceiptLine }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="font-mono">{line.serialNo}</span>
      <span className="truncate text-xs text-muted-foreground">
        {line.skuCode} · {line.modelName}
      </span>
    </span>
  );
}

/** Units that left transit (received at the branch, or on a unit transfer): read-only. */
function DoneSection({ title, lines }: { title: string; lines: DeliveryReceiptLine[] }) {
  if (lines.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">
        {title} ({lines.length})
      </h3>
      <ul className="space-y-2">
        {lines.map((line) => (
          <li
            key={line.serialNumberId}
            className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm"
          >
            <SerialLabel line={line} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Units held by an open unit transfer: no actions here, only a link to the transfer. */
function OnTransferSection({ lines }: { lines: DeliveryReceiptLine[] }) {
  if (lines.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">On transfer ({lines.length})</h3>
      <ul className="space-y-2">
        {lines.map((line) => (
          <li
            key={line.serialNumberId}
            className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm"
          >
            <SerialLabel line={line} />
            {line.openTransfer ? (
              <Link
                href={`/logistics/delivery-transfers/${line.openTransfer.id}`}
                className="ml-auto rounded-sm text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                On transfer {line.openTransfer.transferNo}
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
