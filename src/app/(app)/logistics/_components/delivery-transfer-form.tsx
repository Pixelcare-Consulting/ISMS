"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  DeliveryTransferLineStatusBadge,
  DeliveryTransferStatusBadge,
} from "@/app/(app)/logistics/_components/delivery-transfer-status-badge";
import {
  cancelDeliveryTransferAction,
  decideDeliveryTransferLineAction,
  receiveDeliveryTransferLineAction,
  releaseDeliveryTransferAction,
  retryDeliveryTransferSapAction,
  updateDeliveryTransferLineRemarksAction,
} from "@/features/logistics/actions/logistics.actions";
import { sapTransferNotPostedMessage } from "@/features/logistics/constants/delivery-workflow-labels";
import type { WorkflowStatusOption } from "@/features/logistics/constants/workflow-codes";
import type { LogisticsActionCapabilities } from "@/features/logistics/constants/logistics-permissions";
import type { DeliveryTransferDetail } from "@/features/logistics/services/delivery-transfer.service";
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
import { Input } from "@/components/ui/input";

const dateFormat = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" });

type Line = DeliveryTransferDetail["lines"][number];
type ActionResult = { success: true } | { error: string };

export function DeliveryTransferForm({
  detail,
  capabilities,
  workflowStatuses = [],
}: {
  detail: DeliveryTransferDetail;
  capabilities: LogisticsActionCapabilities;
  workflowStatuses?: readonly WorkflowStatusOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const awaitingApproval = detail.status === "PENDING_APPROVAL";
  const inTransit = detail.status === "IN_TRANSIT";
  const canEditRemarks =
    awaitingApproval && (capabilities.canCreateDeliveryTransfer || capabilities.canApproveDeliveryTransfer);
  const releasable =
    awaitingApproval &&
    capabilities.canApproveDeliveryTransfer &&
    detail.lines.some((line) => line.status === "APPROVED") &&
    !detail.lines.some((line) => line.status === "PENDING");
  // Released but nothing moved yet: no SAP IT and no unit received.
  const cancellable =
    inTransit &&
    capabilities.canApproveDeliveryTransfer &&
    !detail.sapDocNo &&
    !detail.lines.some((line) => line.status === "RECEIVED");
  const canRetrySap = detail.sapPending && inTransit && capabilities.canApproveDeliveryTransfer;

  function run(action: () => Promise<ActionResult>, success: string) {
    startTransition(async () => {
      const result = await action();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(success);
      router.refresh();
    });
  }

  function release() {
    startTransition(async () => {
      const result = await releaseDeliveryTransferAction(detail.id);
      setConfirmRelease(false);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      if (result.sapError) {
        toast.warning(`Released. SAP IT was not posted: ${result.sapError}`);
      } else {
        toast.success(result.sapDocNo ? `Released. SAP IT ${result.sapDocNo}.` : "Released. Units are in transit.");
      }
      router.refresh();
    });
  }

  function retrySap() {
    startTransition(async () => {
      const result = await retryDeliveryTransferSapAction(detail.id);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      if (result.sapDocNo) {
        toast.success(`SAP IT ${result.sapDocNo} posted. Units can be accepted now.`);
      } else {
        toast.error(sapTransferNotPostedMessage(result.sapError));
      }
      router.refresh();
    });
  }

  function cancelTransfer() {
    startTransition(async () => {
      const result = await cancelDeliveryTransferAction(detail.id);
      setConfirmCancel(false);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(`${detail.transferNo} cancelled. The units stay pending acceptance on the delivery.`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <Link
            href="/logistics/delivery-transfers"
            className="rounded-sm text-sm text-muted-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Back to unit transfers
          </Link>
          <h2 className="text-xl font-semibold">{detail.transferNo}</h2>
          <p className="text-sm text-muted-foreground">From delivery {detail.delivery.deliveryNo}</p>
        </div>
        {awaitingApproval && capabilities.canApproveDeliveryTransfer ? (
          <div className="flex flex-col items-end gap-1">
            <Button className="max-sm:h-11" disabled={pending || !releasable} onClick={() => setConfirmRelease(true)}>
              Release
            </Button>
            {!releasable ? (
              <p className="text-xs text-muted-foreground">Approve or delete every line first.</p>
            ) : null}
          </div>
        ) : null}
        {cancellable ? (
          <Button variant="outline" className="max-sm:h-11" disabled={pending} onClick={() => setConfirmCancel(true)}>
            Cancel transfer
          </Button>
        ) : null}
      </div>

      <section aria-label="Transfer header" className="rounded-lg border bg-card p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <dl className="space-y-3">
            <Field label="Transfer No" value={detail.transferNo} />
            <Field label="Created by" value={detail.createdByName ?? "Unknown"} />
            <Field label="Created date" value={dateFormat.format(new Date(detail.createdAt))} />
          </dl>
          <dl className="space-y-3">
            <Field label="Branch release" value={detail.releaseName} />
            <Field label="Branch receive" value={detail.receiveName} />
            <div>
              <dt className="text-sm text-muted-foreground">Transfer status</dt>
              <dd className="mt-1">
                <DeliveryTransferStatusBadge status={detail.status} catalog={workflowStatuses} />
              </dd>
            </div>
          </dl>
        </div>
        {detail.sapDocNo || detail.sapPending ? (
          <div className="mt-4 space-y-2 border-t pt-3 text-sm">
            {detail.sapDocNo ? (
              <p>
                SAP IT <span className="font-medium tabular-nums">{detail.sapDocNo}</span>
                {detail.sapDocDate ? <span className="text-muted-foreground"> · {detail.sapDocDate}</span> : null}
              </p>
            ) : (
              <p className="text-destructive" role="alert">
                {sapTransferNotPostedMessage(detail.sapError)}
                {detail.sapPending ? " Units cannot be accepted until it posts." : ""}
              </p>
            )}
            {canRetrySap ? (
              <Button size="sm" className="max-sm:h-11" disabled={pending} onClick={retrySap}>
                {pending ? "Retrying…" : "Retry SAP posting"}
              </Button>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold">Transfer details</h3>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Model</th>
                <th scope="col" className="px-3 py-2 font-medium">Serial number</th>
                <th scope="col" className="px-3 py-2 font-medium">Remarks</th>
                <th scope="col" className="px-3 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {detail.lines.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                    This transfer has no units.
                  </td>
                </tr>
              ) : (
                detail.lines.map((line) => (
                  <tr key={line.id} className="border-t align-middle">
                    <td className="px-3 py-2">
                      <span className="font-medium">{line.skuCode}</span>
                      <span className="block text-xs text-muted-foreground">{line.modelName}</span>
                    </td>
                    <td className="px-3 py-2 font-mono">{line.serialNo}</td>
                    <td className="px-3 py-2">
                      {canEditRemarks && line.status === "PENDING" ? (
                        <RemarksInput line={line} disabled={pending} />
                      ) : (
                        <span className={line.remarks ? undefined : "text-muted-foreground"}>
                          {line.remarks || "None"}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <LineActions
                        line={line}
                        pending={pending}
                        canApprove={awaitingApproval && capabilities.canApproveDeliveryTransfer}
                        canReceive={inTransit && capabilities.canReceiveDeliveryTransfer}
                        receiveBlocked={detail.sapPending}
                        onApprove={() =>
                          run(() => decideDeliveryTransferLineAction(line.id, "APPROVE"), `${line.serialNo} approved`)
                        }
                        onDelete={() =>
                          run(
                            () => decideDeliveryTransferLineAction(line.id, "REMOVE"),
                            `${line.serialNo} removed from the transfer`,
                          )
                        }
                        onAccept={() =>
                          run(() => receiveDeliveryTransferLineAction(line.id), `${line.serialNo} received`)
                        }
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <AlertDialog
        open={confirmRelease}
        onOpenChange={(open) => {
          if (!pending) setConfirmRelease(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Release {detail.transferNo}?</AlertDialogTitle>
            <AlertDialogDescription>
              Approved units go in transit to {detail.receiveName}. Each unit moves into stock when it is accepted there.
              {detail.postsToSap ? " An SAP Inventory Transfer is posted for the approved units." : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                release();
              }}
            >
              {pending ? "Releasing…" : "Release"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmCancel}
        onOpenChange={(open) => {
          if (!pending) setConfirmCancel(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {detail.transferNo}?</AlertDialogTitle>
            <AlertDialogDescription>
              No unit has moved yet. The approved units come off this transfer and stay pending acceptance on delivery{" "}
              {detail.delivery.deliveryNo}, so they can be accepted, returned or put on a new transfer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep transfer</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                cancelTransfer();
              }}
            >
              {pending ? "Cancelling…" : "Cancel transfer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}

/** Saves on blur when the text changed. */
function RemarksInput({ line, disabled }: { line: Line; disabled: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(line.remarks ?? "");
  const [saving, startSaving] = useTransition();

  function save() {
    if (value.trim() === (line.remarks ?? "")) return;
    startSaving(async () => {
      const result = await updateDeliveryTransferLineRemarksAction(line.id, value);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(`Remarks saved for ${line.serialNo}`);
      router.refresh();
    });
  }

  return (
    <Input
      aria-label={`Remarks for ${line.serialNo}`}
      value={value}
      maxLength={500}
      disabled={disabled || saving}
      placeholder="Add remarks"
      className="min-w-48 max-sm:h-11"
      onChange={(event) => setValue(event.target.value)}
      onBlur={save}
    />
  );
}

function LineActions({
  line,
  pending,
  canApprove,
  canReceive,
  receiveBlocked,
  onApprove,
  onDelete,
  onAccept,
}: {
  line: Line;
  pending: boolean;
  canApprove: boolean;
  canReceive: boolean;
  receiveBlocked: boolean;
  onApprove: () => void;
  onDelete: () => void;
  onAccept: () => void;
}) {
  const showApprove = canApprove && line.status === "PENDING";
  const showDelete = canApprove && (line.status === "PENDING" || line.status === "APPROVED");
  const showAccept = canReceive && line.status === "APPROVED";

  if (!showApprove && !showDelete && !showAccept) {
    return <DeliveryTransferLineStatusBadge status={line.status} />;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {line.status !== "PENDING" ? <DeliveryTransferLineStatusBadge status={line.status} /> : null}
      {showApprove ? (
        <Button size="sm" className="max-sm:h-11" disabled={pending} onClick={onApprove}>
          Approve
        </Button>
      ) : null}
      {showAccept ? (
        <Button
          size="sm"
          className="bg-emerald-600 text-white hover:bg-emerald-700 max-sm:h-11"
          disabled={pending || receiveBlocked}
          title={receiveBlocked ? "Waiting for the SAP transfer to post" : undefined}
          onClick={onAccept}
        >
          Accept
        </Button>
      ) : null}
      {showDelete ? (
        <Button size="sm" variant="outline" className="max-sm:h-11" disabled={pending} onClick={onDelete}>
          Delete
        </Button>
      ) : null}
    </div>
  );
}
