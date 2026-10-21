"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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
}

/**
 * Branch receipt of a dispatched delivery. A first receipt ticks which units
 * arrived; unticked units stay in transit. A partial delivery lists the units
 * still in transit with a per-unit accept / reject.
 */
export function DeliveryReceiveDialog({
  target,
  onClose,
  onReceived,
  loadLines,
  accept,
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
}: DeliveryReceiveDialogProps & { target: ReceiveTarget }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [selected, setSelected] = useState<string[]>([]);
  const [reasonFor, setReasonFor] = useState<{
    line: DeliveryReceiptLine;
    action: "accept" | "reject";
  } | null>(null);
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
      setSelected(result.lines.filter((line) => line.inTransit).map((line) => line.serialNumberId));
    });
    return () => {
      cancelled = true;
    };
  }, [loadLines, target.id]);

  const inTransit = state.kind === "ready" ? state.lines.filter((line) => line.inTransit) : [];
  const received = state.kind === "ready" ? state.lines.filter((line) => !line.inTransit) : [];
  const isPartial = state.kind === "ready" && state.status === "partial";

  function submitAccept(serialNumberIds: string[]) {
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
            : `Tick the units that arrived at ${target.branchName}. Unticked units stay in transit until they are accepted or the delivery is rejected.`}
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
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => setReasonFor({ line, action: "reject" })}
                      >
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        disabled={pending}
                        className="bg-emerald-600 text-white hover:bg-emerald-700"
                        onClick={() => setReasonFor({ line, action: "accept" })}
                      >
                        Accept
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="space-y-2">
            <h3 className="text-sm font-medium">Received ({received.length})</h3>
            <ul className="space-y-2">
              {received.map((line) => (
                <li
                  key={line.serialNumberId}
                  className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm"
                >
                  <SerialLabel line={line} />
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : inTransit.length === 0 ? (
        <p className="text-sm text-muted-foreground">No units on this delivery are in transit.</p>
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
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" disabled={pending} onClick={onClose}>
          Cancel
        </Button>
        {state.kind === "ready" && inTransit.length > 0 ? (
          isPartial ? (
            <Button
              disabled={pending}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => submitAccept(inTransit.map((line) => line.serialNumberId))}
            >
              Accept all remaining ({inTransit.length})
            </Button>
          ) : (
            <Button
              disabled={pending || selected.length === 0}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => submitAccept(selected)}
            >
              Accept {selected.length} of {inTransit.length}
            </Button>
          )
        ) : null}
      </DialogFooter>

      <UnitReasonDialog request={reasonFor} onClose={() => setReasonFor(null)} />
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

/**
 * Per-unit accept / reject with a reason. UI only: the workflow behind it is
 * still being confirmed with the client, so submitting records nothing.
 */
function UnitReasonDialog({
  request,
  onClose,
}: {
  request: { line: DeliveryReceiptLine; action: "accept" | "reject" } | null;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const verb = request?.action === "reject" ? "Reject" : "Accept";

  function close() {
    setReason("");
    onClose();
  }

  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {verb} {request?.line.serialNo}
          </DialogTitle>
          <DialogDescription>
            Give the reason for this unit, for example damaged in transit or missing from the
            shipment.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="unit-receipt-reason">Reason</Label>
          <Textarea
            id="unit-receipt-reason"
            value={reason}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Per-unit receipt is not active yet. Submitting does not change stock.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={reason.trim().length === 0}
            className={
              request?.action === "reject" ? undefined : "bg-emerald-600 text-white hover:bg-emerald-700"
            }
            onClick={() => {
              toast.info("Per-unit receipt is not active yet. Nothing was saved.");
              close();
            }}
          >
            {verb} unit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
