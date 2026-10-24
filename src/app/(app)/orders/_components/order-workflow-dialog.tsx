"use client";

import { useMemo, useState } from "react";

import { OrderApprovalTimeline } from "@/app/(app)/orders/_components/order-approval-timeline";
import { OrderWorksheet } from "@/app/(app)/orders/_components/order-worksheet";
import { useOrderWorksheet } from "@/app/(app)/orders/_components/use-order-worksheet";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { OrderStatusBadge } from "@/features/orders/components/order-status-badge";
import { BRANCH_ORDER_TYPE_LABELS } from "@/features/orders/constants/order-status";
import {
  getAfterApproveHint,
  getCurrentApproverLabel,
  isSupplyPlanningApprovalStep,
} from "@/features/orders/constants/order-workflow";
import type { ApprovalTimelineSource } from "@/features/orders/lib/order-approval-timeline";
import { worksheetLinesOnOrder } from "@/features/orders/lib/order-create-details";
import { worksheetOrderTotals } from "@/features/orders/lib/order-worksheet-filters";
import { buildOrderReviewSnapshot, type OrderReviewSnapshot } from "@/features/orders/lib/order-review-snapshot";
import {
  draftsForOrderLines,
  EMPTY_WORKSHEET_DRAFT,
  projectWorksheetLines,
  type WorksheetDraftInput,
} from "@/features/orders/lib/order-worksheet-rows";
import { getDeliveryDueDateWarning } from "@/features/orders/utils/delivery-schedule";
import type { BranchOrderStatus, BranchOrderType } from "@prisma/client";

export interface OrderWorkflowLine {
  detailId: string;
  modelId: string;
  skuCode: string;
  quantity: number;
  remarks?: string | null;
  spRemarks?: string | null;
}

interface OrderWorkflowDialogProps {
  orderId: string;
  orderNumber: string;
  orderType: BranchOrderType;
  branchId: string;
  branchName: string;
  updatedAt?: string | Date | null;
  deliverySchedule?: unknown;
  lines: OrderWorkflowLine[];
  approvalLevels?: readonly ApprovalTimelineSource[];
  status: BranchOrderStatus;
  open: boolean;
  pending?: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: (input?: {
    comment?: string;
    lineAdjustments?: {
      detailId: string;
      approvedQty: number;
      spRemarks?: string | null;
    }[];
    deliveryDueDate?: string;
    expectedUpdatedAt?: string;
    reviewSnapshot?: OrderReviewSnapshot;
  }) => void;
  onReject: (comment?: string) => void;
}

function toIso(value: string | Date | null | undefined): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export function OrderWorkflowDialog({
  orderId,
  orderNumber,
  orderType,
  branchId,
  branchName,
  updatedAt,
  deliverySchedule,
  lines,
  approvalLevels = [],
  status,
  open,
  pending,
  onOpenChange,
  onApprove,
  onReject,
}: OrderWorkflowDialogProps) {
  const [comment, setComment] = useState("");
  const [deliveryDueDate, setDeliveryDueDate] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<"approve" | "reject" | null>(null);
  const [drafts, setDrafts] = useState<Record<string, WorksheetDraftInput>>({});
  const [draftsForOrderId, setDraftsForOrderId] = useState<string | null>(null);
  const modelIds = useMemo(() => lines.map((line) => line.modelId), [lines]);
  const worksheet = useOrderWorksheet({
    enabled: open,
    branchId,
    orderType,
    existingModelIds: modelIds,
    excludeOrderId: orderId,
  });
  const orderModelIds = useMemo(() => new Set(lines.map((line) => line.modelId)), [lines]);
  const orderSheetLines = useMemo(
    () => worksheetLinesOnOrder(worksheet.payload?.lines ?? [], orderModelIds),
    [orderModelIds, worksheet.payload],
  );
  if (worksheet.payload && draftsForOrderId !== orderId) {
    setDraftsForOrderId(orderId);
    setDrafts(draftsForOrderLines(worksheet.payload.lines, lines));
  }

  const isSpFinalStep = isSupplyPlanningApprovalStep(status, orderType);
  const deliveryDueWarning = isSpFinalStep
    ? getDeliveryDueDateWarning(deliveryDueDate, deliverySchedule)
    : null;
  const currentApprover = getCurrentApproverLabel(status, orderType);
  const afterApprove = getAfterApproveHint(status, orderType);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && pending) return;
    if (nextOpen) {
      setComment("");
      setDeliveryDueDate("");
      setActionError(null);
      setConfirmAction(null);
    }
    onOpenChange(nextOpen);
  }

  function submitApprove() {
    setActionError(null);
    if (isSpFinalStep && (worksheet.loading || !worksheet.payload)) {
      setActionError("Wait for the worksheet to load before approving.");
      setConfirmAction(null);
      return;
    }
    if (isSpFinalStep && worksheet.error) {
      setActionError(worksheet.error);
      setConfirmAction(null);
      return;
    }

    const projected = worksheet.payload
      ? projectWorksheetLines(worksheet.payload.lines, drafts, orderType, "readonly")
      : [];
    const lineAdjustments = isSpFinalStep
      ? lines
          .filter((line) => line.quantity >= 1)
          .map((line) => {
            const row = projected.find((item) => item.modelId === line.modelId);
            return {
              detailId: line.detailId,
              approvedQty: row?.approvedQty ?? line.quantity,
              spRemarks: row?.spRemarks.trim() ? row.spRemarks.trim() : null,
            };
          })
      : undefined;
    const reviewSnapshot =
      isSpFinalStep && worksheet.payload
        ? buildOrderReviewSnapshot(
            worksheet.payload.summary,
            worksheetOrderTotals(projected, { includeApproved: true }),
          )
        : undefined;

    onApprove({
      comment: comment || undefined,
      lineAdjustments,
      deliveryDueDate: isSpFinalStep && deliveryDueDate ? deliveryDueDate : undefined,
      expectedUpdatedAt: toIso(updatedAt),
      reviewSnapshot,
    });
  }

  function handleApprove() {
    setConfirmAction("approve");
  }

  function submitReject() {
    setActionError(null);
    onReject(comment.trim());
  }

  function handleReject() {
    if (!comment.trim()) {
      setActionError(
        isSpFinalStep
          ? "Please add a comment before cancelling the request."
          : "Please add a rejection comment before rejecting.",
      );
      return;
    }
    setConfirmAction("reject");
  }

  function handleConfirmAction() {
    if (confirmAction === "approve") submitApprove();
    if (confirmAction === "reject") submitReject();
    setConfirmAction(null);
  }

  function updateDraft(modelId: string, patch: Partial<WorksheetDraftInput>) {
    setDrafts((prev) => ({
      ...prev,
      [modelId]: {
        ...EMPTY_WORKSHEET_DRAFT,
        ...prev[modelId],
        ...patch,
      },
    }));
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="flex max-h-[calc(100svh-1rem)] w-[calc(100%-1rem)] max-w-90rem flex-col gap-0 overflow-hidden p-0 sm:max-w-[90rem] sm:p-0">
          <DialogHeader className="shrink-0 border-b px-4 py-4 sm:px-6">
            <DialogTitle>Review order {orderNumber}</DialogTitle>
            <DialogDescription className="max-w-3xl">
              {isSpFinalStep
                ? "Supply Planning approves the request or cancels it. Approval opens a delivery and does not move stock."
                : "Manual requests go to Supply Planning. Team Leaders may optionally edit before Supply Planning decides. Auto-replenish still needs Team Leader, then Supply Planning."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto xl:flex-row xl:overflow-hidden">
            <aside className="flex w-full shrink-0 flex-col gap-4 border-b px-4 py-4 sm:px-6 xl:w-80 xl:overflow-y-auto xl:border-b-0 xl:border-r xl:px-5">
              <dl className="grid grid-cols-[4.75rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Type</dt>
                <dd className="min-w-0 break-words">
                  {BRANCH_ORDER_TYPE_LABELS[orderType] ?? orderType}
                </dd>
                <dt className="text-muted-foreground">Branch</dt>
                <dd className="min-w-0 break-words">{branchName}</dd>
                <dt className="text-muted-foreground">Status</dt>
                <dd className="min-w-0">
                  <OrderStatusBadge status={status} />
                </dd>
                {currentApprover ? (
                  <>
                    <dt className="text-muted-foreground">Approver</dt>
                    <dd className="min-w-0 break-words">{currentApprover}</dd>
                  </>
                ) : null}
              </dl>
              {afterApprove ? (
                <p className="text-sm leading-relaxed text-muted-foreground">{afterApprove}</p>
              ) : null}
              {isSpFinalStep ? (
                <div className="space-y-1.5">
                  <Label htmlFor="delivery-due">Delivery due date (optional)</Label>
                  <Input
                    id="delivery-due"
                    type="date"
                    value={deliveryDueDate}
                    onChange={(event) => setDeliveryDueDate(event.target.value)}
                  />
                  {deliveryDueWarning ? (
                    <p className="text-xs text-amber-600 dark:text-amber-500">{deliveryDueWarning}</p>
                  ) : null}
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="order-comment">Overall comment (optional)</Label>
                <Textarea
                  id="order-comment"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  rows={4}
                  className="min-h-24"
                />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  This comment stays on the order. Line remarks for Supply Planning are entered on
                  requested rows.
                </p>
                {actionError ? <p className="text-xs text-destructive">{actionError}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="order-review-history">Approval history</Label>
                <OrderApprovalTimeline
                  id="order-review-history"
                  orderType={orderType}
                  levels={approvalLevels}
                />
              </div>
            </aside>
            <div className="flex min-h-[24rem] min-w-0 flex-1 flex-col px-4 py-3 sm:px-6 xl:min-h-0 xl:overflow-hidden">
              <OrderWorksheet
                lines={orderSheetLines}
                brands={worksheet.payload?.brands ?? []}
                drafts={drafts}
                mode="review"
                orderType={orderType}
                loading={worksheet.loading}
                error={worksheet.error}
                summary={worksheet.payload?.summary ?? null}
                summaryMode="current"
                showApprovedQty={isSpFinalStep}
                approvedQtyEditable={isSpFinalStep}
                showSpRemarks={isSpFinalStep}
                spRemarksEditable={isSpFinalStep}
                onApprovedQtyChange={(modelId, quantity) =>
                  updateDraft(modelId, {
                    approvedQty: Number.isFinite(quantity) ? Math.floor(quantity) : null,
                  })
                }
                onSpRemarksChange={(modelId, spRemarks) => updateDraft(modelId, { spRemarks })}
              />
            </div>
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t px-4 py-4 sm:justify-end sm:px-6">
            <Button variant="outline" disabled={pending} onClick={handleReject}>
              {isSpFinalStep ? "Cancel request" : "Reject"}
            </Button>
            <Button disabled={pending} onClick={handleApprove}>
              {pending
                ? "Saving…"
                : isSpFinalStep
                  ? "Approve"
                  : status === "pending_ps"
                    ? "Submit"
                    : "Approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={confirmAction !== null}
        onOpenChange={(nextOpen) => !nextOpen && setConfirmAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === "approve"
                ? "Approve this order?"
                : isSpFinalStep
                  ? "Cancel this order request?"
                  : "Reject this order?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === "approve"
                ? isSpFinalStep
                  ? "Approval opens a delivery for logistics. Warehouse and branch stock stay unchanged."
                  : "This sends the request to the next reviewer."
                : isSpFinalStep
                  ? "Supply Planning cancels the request. No delivery is created."
                  : "This rejects the order request."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={handleConfirmAction}
              className={
                confirmAction === "reject"
                  ? "bg-destructive text-white hover:bg-destructive/90"
                  : undefined
              }
            >
              {confirmAction === "approve"
                ? "Confirm approve"
                : isSpFinalStep
                  ? "Confirm cancel"
                  : "Confirm reject"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
