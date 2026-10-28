"use client";

import Link from "next/link";
import { useEffect, useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { returnRequestTerm } from "@/features/logistics/constants/delivery-workflow-labels";
import {
  DEFAULT_REJECT_REMARKS,
  RETURN_LINE_REMARKS_MAX,
  RETURN_ON_TRANSFER_ERROR,
  RETURN_REASON_MAX,
} from "@/features/logistics/services/delivery-return.planner";
import type { DeliveryReceiptLine } from "@/features/logistics/services/delivery-posting.service";
import type { DeliveryReturnUnitInput } from "@/features/logistics/services/delivery-return.service";
import type { OrderSapDocType } from "@/features/orders/constants/order-sap-doc-type";
import { Button } from "@/components/ui/button";
import { LoadingModal } from "@/components/ui/loading-modal";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  /** SO deliveries go back on a return request, ITR ones on a transfer request. */
  sapDocType?: OrderSapDocType | null;
}

type LoadLinesResult =
  | { success: true; status: string; lines: DeliveryReceiptLine[] }
  | { error: string };

type ReturnResult = { success: true; requestNo: string } | { error: string };

type AcceptResult =
  | { success: true; movedCount: number; status: "accepted" | "partial" }
  | { error: string };

interface DeliveryReceiveDialogProps {
  target: ReceiveTarget | null;
  onClose: () => void;
  /** Called after a successful accept or return request so the list can refresh. */
  onReceived: () => void;
  loadLines: (deliveryId: string) => Promise<LoadLinesResult>;
  accept: (deliveryId: string, input: { serialNumberIds: string[] }) => Promise<AcceptResult>;
  /** Shows Receive (logistics.delivery.receive and its aliases); false for a return-only user. */
  canReceive?: boolean;
  /** Enables Return (logistics.delivery_return.request); omit when the user lacks it. */
  requestReturn?: (
    deliveryId: string,
    remarks: string | null,
    units: DeliveryReturnUnitInput[],
  ) => Promise<ReturnResult>;
}

/**
 * Branch receipt of a dispatched delivery. Every in-transit unit starts ticked:
 * receive or return all of them, or untick some to act on the ticked ones only.
 * A return goes to the TL for approval and, once approved, posts the SAP Return
 * (SO) or IT (ITR). Units on an open unit transfer are settled there, not here.
 */
export function DeliveryReceiveDialog({
  target,
  onClose,
  onReceived,
  loadLines,
  accept,
  canReceive = true,
  requestReturn,
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
            canReceive={canReceive}
            requestReturn={requestReturn}
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
  canReceive,
  requestReturn,
}: DeliveryReceiveDialogProps & { target: ReceiveTarget }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  /** How many units the accept in flight covers; null when none is running. */
  const [acceptingCount, setAcceptingCount] = useState<number | null>(null);
  const [step, setStep] = useState<"select" | "reject">("select");
  const [remarks, setRemarks] = useState("");
  const [lineRemarks, setLineRemarks] = useState<Record<string, string>>({});
  const [rejectError, setRejectError] = useState<string | null>(null);
  const remarksId = useId();

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
  }, [loadLines, target.id]);

  const lines = state.kind === "ready" ? state.lines : [];
  // In transit and free to act on here; the rest are listed read-only.
  const inTransit = lines.filter((line) => line.state === "IN_TRANSIT");
  const onTransfer = lines.filter((line) => line.state === "ON_TRANSFER");
  const pendingReject = lines.filter((line) => line.state === "PENDING_REJECT");
  const received = lines.filter((line) => line.state === "RECEIVED");
  const transferred = lines.filter((line) => line.state === "TRANSFERRED");
  const returned = lines.filter((line) => line.state === "RETURNED");
  const isPartial = state.kind === "ready" && state.status === "partial";
  const ticked = inTransit.filter((line) => selected.includes(line.serialNumberId));
  const allTicked = inTransit.length > 0 && ticked.length === inTransit.length;
  const scope = allTicked ? "all" : `ticked (${ticked.length})`;
  const requestTerm = returnRequestTerm(target.sapDocType);

  function toggle(serialNumberId: string, checked: boolean) {
    setSelected((current) =>
      checked ? [...current, serialNumberId] : current.filter((id) => id !== serialNumberId),
    );
  }

  function submitAccept() {
    const ids = ticked.map((line) => line.serialNumberId);
    setAcceptingCount(ids.length);
    startTransition(async () => {
      let result: AcceptResult;
      try {
        result = await accept(target.id, { serialNumberIds: ids });
      } finally {
        setAcceptingCount(null);
      }
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.status === "partial"
          ? `Received ${serialCount(result.movedCount)}. The rest stay in transit.`
          : `Received ${serialCount(result.movedCount)} into branch stock.`,
      );
      onReceived();
      onClose();
    });
  }

  function submitReject() {
    if (!requestReturn) return;
    startTransition(async () => {
      const result = await requestReturn(
        target.id,
        remarks.trim() || null,
        ticked.map((line) => ({
          serialNumberId: line.serialNumberId,
          remarks: lineRemarks[line.serialNumberId]?.trim() || null,
        })),
      );
      if ("error" in result) {
        setRejectError(result.error);
        return;
      }
      toast.success(`${requestTerm} ${result.requestNo} sent to the TL for approval.`);
      onReceived();
      onClose();
    });
  }

  if (step === "reject") {
    const overallDefault = remarks.trim() || DEFAULT_REJECT_REMARKS;
    return (
      <>
        <DialogHeader>
          <DialogTitle>
            Reject {allTicked ? "all units" : serialCount(ticked.length)} on {target.deliveryNo}
          </DialogTitle>
          <DialogDescription>
            This creates an {requestTerm} for the TL. Once approved, SAP gets the{" "}
            {target.sapDocType === "ITR" ? "IT" : "Return"} and the units go back to the warehouse. Until then
            they stay in transit. Remarks are optional.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor={remarksId}>Remarks</Label>
          <Textarea
            id={remarksId}
            value={remarks}
            maxLength={RETURN_REASON_MAX}
            rows={2}
            disabled={pending}
            placeholder={DEFAULT_REJECT_REMARKS}
            onChange={(event) => {
              setRemarks(event.target.value);
              setRejectError(null);
            }}
          />
        </div>
        <section className="space-y-1.5">
          <h3 className="text-sm font-medium">Units ({ticked.length})</h3>
          {/* Capped to the smaller of 18rem and 40% of the viewport, so a long reject still leaves the remarks and buttons on screen. */}
          <ul
            className="max-h-[min(18rem,40svh)] space-y-2 overflow-y-auto overscroll-contain pr-1"
            aria-label="Rejected units"
          >
          {ticked.map((line) => (
            <li key={line.serialNumberId} className="space-y-2 rounded-md border px-3 py-2 text-sm">
              <SerialLabel line={line} />
              <Input
                value={lineRemarks[line.serialNumberId] ?? ""}
                maxLength={RETURN_LINE_REMARKS_MAX}
                disabled={pending}
                placeholder={overallDefault}
                aria-label={`Remarks for ${line.serialNo}`}
                onChange={(event) =>
                  setLineRemarks((current) => ({ ...current, [line.serialNumberId]: event.target.value }))
                }
              />
            </li>
          ))}
          </ul>
        </section>
        {rejectError ? (
          <p className="text-sm text-destructive" role="alert">
            {rejectError}
          </p>
        ) : null}
        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" className="max-sm:h-11" disabled={pending} onClick={() => setStep("select")}>
            Back
          </Button>
          <Button variant="destructive" className="max-sm:h-11" disabled={pending} onClick={submitReject}>
            {pending ? "Sending…" : `Reject and send ${requestTerm}`}
          </Button>
        </DialogFooter>
      </>
    );
  }

  const canAct = state.kind === "ready" && ticked.length > 0;
  // A unit on an open unit transfer cannot also be rejected onto a request.
  const returnBlocked = onTransfer.length > 0;

  return (
    <>
      <LoadingModal
        open={acceptingCount !== null}
        title={`Receiving ${serialCount(acceptingCount ?? 0)}`}
        description={`Moving them into ${target.branchName} stock. Please keep this page open.`}
      />
      <DialogHeader>
        <DialogTitle>Receive {target.deliveryNo}</DialogTitle>
        <DialogDescription>
          {isPartial ? "Part of this delivery is already settled. " : ""}
          Receive or reject every unit, or untick units to act on the ticked ones only.
        </DialogDescription>
      </DialogHeader>

      {state.kind === "loading" ? (
        <p className="text-sm text-muted-foreground">Loading delivery serials…</p>
      ) : state.kind === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      ) : (
        <div className="max-h-96 space-y-4 overflow-y-auto">
          {inTransit.length === 0 ? (
            <p className="text-sm text-muted-foreground">No units on this delivery are waiting to be received.</p>
          ) : (
            <section className="space-y-2">
              <label className="flex min-h-11 items-center gap-3 px-3 text-sm font-medium">
                <Checkbox
                  checked={allTicked ? true : ticked.length > 0 ? "indeterminate" : false}
                  onCheckedChange={(value) =>
                    setSelected(value === true ? inTransit.map((line) => line.serialNumberId) : [])
                  }
                  aria-label="Tick all units"
                />
                In transit ({ticked.length} of {inTransit.length} ticked)
              </label>
              <ul className="space-y-2">
                {inTransit.map((line) => (
                  <li key={line.serialNumberId}>
                    <label className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
                      <Checkbox
                        checked={selected.includes(line.serialNumberId)}
                        onCheckedChange={(value) => toggle(line.serialNumberId, value === true)}
                        aria-label={`Tick ${line.serialNo}`}
                      />
                      <SerialLabel line={line} />
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <OnTransferSection lines={onTransfer} />
          <PendingRejectSection lines={pendingReject} />
          <DoneSection title="Received" lines={received} />
          <DoneSection title="Returned" lines={returned} />
          <DoneSection title="Transferred" lines={transferred} />
        </div>
      )}

      {requestReturn && canAct && returnBlocked ? (
        <p className="text-xs text-muted-foreground">To reject units: {RETURN_ON_TRANSFER_ERROR}</p>
      ) : null}

      <DialogFooter className="flex-wrap gap-2">
        <Button variant="outline" className="max-sm:h-11" disabled={pending} onClick={onClose}>
          Cancel
        </Button>
        {requestReturn && inTransit.length > 0 ? (
          <Button
            variant="outline"
            className="max-sm:h-11"
            disabled={pending || !canAct || returnBlocked}
            onClick={() => setStep("reject")}
          >
            Reject {scope}
          </Button>
        ) : null}
        {canReceive && inTransit.length > 0 ? (
          <Button
            disabled={pending || !canAct}
            className="bg-emerald-600 text-white hover:bg-emerald-700 max-sm:h-11"
            onClick={submitAccept}
          >
            Receive {scope}
          </Button>
        ) : null}
      </DialogFooter>
    </>
  );
}

function serialCount(count: number): string {
  return `${count} serial${count === 1 ? "" : "s"}`;
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

/** Units that left transit (received, returned, or gone on a unit transfer): read-only. */
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

/** Units on a reject request still waiting for the TL or SAP: no actions here until it settles. */
function PendingRejectSection({ lines }: { lines: DeliveryReceiptLine[] }) {
  if (lines.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">Waiting on reject request ({lines.length})</h3>
      <ul className="space-y-2">
        {lines.map((line) => (
          <li
            key={line.serialNumberId}
            className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm"
          >
            <SerialLabel line={line} />
            {line.openReturn ? (
              <span className="ml-auto font-mono text-xs text-muted-foreground">{line.openReturn.requestNo}</span>
            ) : null}
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
