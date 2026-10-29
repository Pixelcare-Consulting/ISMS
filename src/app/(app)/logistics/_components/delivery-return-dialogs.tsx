"use client";

import type { DeliveryReturnStatus } from "@prisma/client";
import { useEffect, useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { DeliveryReturnStatusBadge } from "@/app/(app)/logistics/_components/delivery-transfer-status-badge";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import {
  needsSapRetry,
  pendingReturnOf,
  returnSapFailedMessage,
  sapRetryReturnOf,
  returnSapPendingMessage,
} from "@/features/logistics/constants/delivery-workflow-labels";
import type {
  DeliveryReturnDetail,
  DeliveryReturnOutcome,
} from "@/features/logistics/services/delivery-return.service";
import { formatRejectSapDocNo } from "@/features/logistics/lib/sap-doc-number";
import { Button } from "@/components/ui/button";
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

/** Mirrors RETURN_REASON_MAX on the server; the action re-validates it. */
const TEXT_MAX = 500;
const dateFormat = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" });

/** A reject request of a delivery, as the deliveries lists include them (newest first). */
export interface LatestDeliveryReturn {
  id: string;
  requestNo: string;
  status: DeliveryReturnStatus;
  sapError: string | null;
}

export interface ReturnTarget {
  /** The reject request to review. */
  returnId: string;
  deliveryNo: string;
  branchName: string;
}

type Failure = { error: string };
type LoadResult = { success: true; detail: DeliveryReturnDetail } | Failure;
type OutcomeResult = ({ success: true } & DeliveryReturnOutcome) | Failure;

/**
 * Rejected column: the request that needs attention (waiting for the TL, then
 * SAP not finished), else the newest; a count when there are more.
 */
export function DeliveryReturnCell({ returns }: { returns: readonly LatestDeliveryReturn[] }) {
  const latest = pendingReturnOf(returns) ?? sapRetryReturnOf(returns) ?? returns[0];
  if (!latest) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-col items-start gap-1">
      {returns.length > 1 ? (
        <span className="text-xs text-muted-foreground">{returns.length} reject requests</span>
      ) : null}
      <DeliveryReturnStatusBadge status={latest.status} />
      {needsSapRetry(latest) ? (
        <span
          className={latest.sapError ? "text-xs font-medium text-destructive" : "text-xs text-muted-foreground"}
          title={latest.sapError ?? undefined}
        >
          {latest.sapError ? "SAP posting failed" : "SAP posting not finished"}
        </span>
      ) : null}
    </div>
  );
}

function toastOutcome(outcome: DeliveryReturnOutcome) {
  if (outcome.status === "COMPLETED") {
    toast.success(
      `Return completed${outcome.sapDocNo ? ` (SAP ${outcome.sapDocNo})` : ""}. The units are back in the warehouse.`,
    );
  } else if (outcome.sapError) {
    toast.error(returnSapFailedMessage(outcome.sapError));
  } else if (outcome.status === "APPROVED") {
    toast.message(`Return approved. ${returnSapPendingMessage(null)}`);
  }
}

export interface ReviewReturnActions {
  load: (deliveryId: string) => Promise<LoadResult>;
  decide: (returnId: string, input: { action: "APPROVE" | "REJECT"; note: string | null }) => Promise<OutcomeResult>;
  retry: (returnId: string) => Promise<OutcomeResult>;
  cancel: (returnId: string, note: string) => Promise<OutcomeResult>;
}

/**
 * Latest return of a delivery. An approver can approve or reject a pending
 * request; an approved request whose SAP post failed shows the error and a
 * retry, and an approver can cancel it while SAP has no document for it.
 */
export function DeliveryReturnReviewDialog({
  target,
  canApprove,
  canRetry,
  actions,
  onClose,
  onDone,
}: {
  target: ReturnTarget | null;
  canApprove: boolean;
  canRetry: boolean;
  actions: ReviewReturnActions;
  onClose: () => void;
  onDone: () => void;
}) {
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        {target ? (
          <ReviewBody
            key={target.returnId}
            target={target}
            canApprove={canApprove}
            canRetry={canRetry}
            actions={actions}
            onClose={onClose}
            onDone={onDone}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

type ReviewState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; detail: DeliveryReturnDetail };

function ReviewBody({
  target,
  canApprove,
  canRetry,
  actions,
  onClose,
  onDone,
}: {
  target: ReturnTarget;
  canApprove: boolean;
  canRetry: boolean;
  actions: ReviewReturnActions;
  onClose: () => void;
  onDone: () => void;
}) {
  const noteId = useId();
  const cancelNoteId = useId();
  const [state, setState] = useState<ReviewState>({ kind: "loading" });
  const [cancelNote, setCancelNote] = useState("");
  const [note, setNote] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [pending, startTransition] = useTransition();
  const { load } = actions;

  useEffect(() => {
    let cancelled = false;
    load(target.returnId).then((result) => {
      if (cancelled) return;
      setState("error" in result ? { kind: "error", message: result.error } : { kind: "ready", detail: result.detail });
    });
    return () => {
      cancelled = true;
    };
  }, [load, target.returnId, reloadKey]);

  const detail = state.kind === "ready" ? state.detail : null;
  const canDecide = canApprove && detail?.status === "PENDING_APPROVAL";
  const showRetry = canRetry && needsSapRetry(detail);
  // Approved but SAP has no document yet: the approver can still back out.
  const canCancel = canApprove && detail?.status === "APPROVED" && !detail.sapDocNo;
  const cancelNoteTrimmed = cancelNote.trim();

  /** After a decision or retry: refresh the list, and stay open when SAP still needs attention. */
  function finish(result: OutcomeResult) {
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toastOutcome(result);
    onDone();
    if (result.status === "APPROVED") {
      setReloadKey((key) => key + 1);
      return;
    }
    onClose();
  }

  function decide(action: "APPROVE" | "REJECT") {
    if (!detail) return;
    startTransition(async () => {
      const result = await actions.decide(detail.id, { action, note: note.trim() || null });
      if (!("error" in result) && result.status === "CANCELLED") {
        toast.success(`Return ${detail.requestNo} rejected. The units stay pending acceptance.`);
        onDone();
        onClose();
        return;
      }
      finish(result);
    });
  }

  function retry() {
    if (!detail) return;
    startTransition(async () => finish(await actions.retry(detail.id)));
  }

  function cancelReturn() {
    if (!detail || !cancelNoteTrimmed) return;
    startTransition(async () => {
      const result = await actions.cancel(detail.id, cancelNoteTrimmed);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(`Return ${detail.requestNo} cancelled. The units stay pending acceptance.`);
      onDone();
      onClose();
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Rejected units on {target.deliveryNo}</DialogTitle>
        <DialogDescription>
          {canDecide
            ? `${target.branchName} rejected these units. Approve to post the SAP IT (consignment) or Return (outright) and move them back to the warehouse. Reject to keep them pending acceptance.`
            : `Units ${target.branchName} rejected at receiving.`}
        </DialogDescription>
      </DialogHeader>

      {state.kind === "loading" ? (
        <p className="text-sm text-muted-foreground">Loading the return request…</p>
      ) : state.kind === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      ) : !detail ? (
        <p className="text-sm text-muted-foreground">Reject request not found.</p>
      ) : (
        <div className="max-h-[60vh] space-y-4 overflow-y-auto">
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <Field label="Request No." value={detail.requestNo} />
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="mt-0.5">
                <DeliveryReturnStatusBadge status={detail.status} />
              </dd>
            </div>
            <Field label="Requested by" value={detail.requestedByName ?? "Unknown user"} />
            <Field label="Requested at" value={dateFormat.format(new Date(detail.requestedAt))} />
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Reason</dt>
              <dd className="mt-0.5 whitespace-pre-wrap">{detail.reason}</dd>
            </div>
            {detail.decidedAt ? (
              <>
                <Field label="Decided by" value={detail.decidedByName ?? "Unknown user"} />
                <Field label="Decided at" value={dateFormat.format(new Date(detail.decidedAt))} />
              </>
            ) : null}
            {detail.decisionNote ? (
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Decision note</dt>
                <dd className="mt-0.5 whitespace-pre-wrap">{detail.decisionNote}</dd>
              </div>
            ) : null}
            {detail.sapDocNo ? (
              <Field
                label="SAP document"
                value={`${formatRejectSapDocNo(detail.sapDocNo, detail.orderSapDocType)}${
                  detail.sapDocDate ? ` (${detail.sapDocDate})` : ""
                }`}
              />
            ) : null}
          </dl>

          {needsSapRetry(detail) ? (
            <p
              className={
                detail.sapError
                  ? "rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive"
                  : "rounded-md border px-3 py-2 text-sm text-muted-foreground"
              }
              role={detail.sapError ? "alert" : "status"}
            >
              {returnSapPendingMessage(detail.sapError)}
            </p>
          ) : null}

          <section className="space-y-2">
            <h3 className="text-sm font-medium">Units ({detail.units.length})</h3>
            <ul className="space-y-2">
              {detail.units.map((unit) => (
                <li key={unit.serialNumberId} className="flex flex-col rounded-md border px-3 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="font-mono">{unit.serialNo}</span>
                    {unit.markDefective ? <StatusCodeBadge code="DEF" name="DEF" /> : null}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {unit.skuCode} · {unit.modelName}
                  </span>
                  {unit.remarks ? <span className="mt-1 text-xs">{unit.remarks}</span> : null}
                </li>
              ))}
            </ul>
          </section>

          {canCancel ? (
            <div className="space-y-2">
              <Label htmlFor={cancelNoteId}>Reason for cancelling</Label>
              <Textarea
                id={cancelNoteId}
                value={cancelNote}
                maxLength={TEXT_MAX}
                rows={3}
                aria-describedby={`${cancelNoteId}-hint`}
                onChange={(event) => setCancelNote(event.target.value)}
              />
              <p id={`${cancelNoteId}-hint`} className="text-xs text-muted-foreground">
                Required to cancel. The units stay pending acceptance.
              </p>
            </div>
          ) : null}

          {canDecide ? (
            <div className="space-y-2">
              <Label htmlFor={noteId}>Note (optional)</Label>
              <Textarea
                id={noteId}
                value={note}
                maxLength={TEXT_MAX}
                rows={3}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
          ) : null}
        </div>
      )}

      <DialogFooter className="flex-wrap gap-2">
        <Button variant="outline" className="max-sm:h-11" disabled={pending} onClick={onClose}>
          Close
        </Button>
        {canCancel ? (
          <Button variant="outline" className="max-sm:h-11" disabled={pending || !cancelNoteTrimmed} onClick={cancelReturn}>
            Cancel return
          </Button>
        ) : null}
        {showRetry ? (
          <Button className="max-sm:h-11" disabled={pending} onClick={retry}>
            {pending ? "Retrying…" : "Retry SAP posting"}
          </Button>
        ) : null}
        {canDecide ? (
          <>
            <Button variant="outline" className="max-sm:h-11" disabled={pending} onClick={() => decide("REJECT")}>
              Reject
            </Button>
            <Button className="max-sm:h-11" disabled={pending} onClick={() => decide("APPROVE")}>
              {pending ? "Saving…" : "Approve"}
            </Button>
          </>
        ) : null}
      </DialogFooter>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
