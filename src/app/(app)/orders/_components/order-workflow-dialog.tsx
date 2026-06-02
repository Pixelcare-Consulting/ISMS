"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
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
import { BRANCH_ORDER_TYPE_LABELS } from "@/features/orders/constants/order-status";
import {
  getAfterApproveHint,
  getCurrentApproverLabel,
  getOrderStatusLabel,
  isSupplyPlanningApprovalStep,
} from "@/features/orders/constants/order-workflow";
import { getDeliveryDueDateWarning } from "@/features/orders/utils/delivery-schedule";
import type { BranchOrderStatus, BranchOrderType } from "@prisma/client";
import { cn } from "@/utils/cn";

export interface OrderWorkflowLine {
  detailId: string;
  skuCode: string;
  quantity: number;
}

interface OrderWorkflowDialogProps {
  orderNumber: string;
  orderType: BranchOrderType;
  branchName: string;
  deliverySchedule?: unknown;
  lines: OrderWorkflowLine[];
  status: BranchOrderStatus;
  open: boolean;
  pending?: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: (input?: {
    comment?: string;
    lineAdjustments?: { detailId: string; approvedQty: number }[];
    deliveryDueDate?: string;
  }) => void;
  onReject: (comment?: string) => void;
}

export function OrderWorkflowDialog({
  orderNumber,
  orderType,
  branchName,
  deliverySchedule,
  lines,
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
  const [approvedQtyByLine, setApprovedQtyByLine] = useState<Record<string, number>>(() =>
    Object.fromEntries(lines.map((l) => [l.detailId, l.quantity])),
  );

  const isSpFinalStep = isSupplyPlanningApprovalStep(status, orderType);
  const deliveryDueWarning = isSpFinalStep
    ? getDeliveryDueDateWarning(deliveryDueDate, deliverySchedule)
    : null;
  const statusLabel = getOrderStatusLabel(status);
  const currentApprover = getCurrentApproverLabel(status, orderType);
  const afterApprove = getAfterApproveHint(status, orderType);
  const totalLines = lines.length;
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  const statusBadgeClassName = ORDER_STATUS_VARIANTS[status] ?? "border-border bg-background text-foreground";

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && pending) return;
    if (nextOpen) {
      setComment("");
      setDeliveryDueDate("");
      setActionError(null);
      setConfirmAction(null);
      setApprovedQtyByLine(Object.fromEntries(lines.map((l) => [l.detailId, l.quantity])));
    }
    onOpenChange(nextOpen);
  }

  function submitApprove() {
    setActionError(null);
    const lineAdjustments = isSpFinalStep
      ? lines.map((l) => ({
          detailId: l.detailId,
          approvedQty: approvedQtyByLine[l.detailId] ?? l.quantity,
        }))
      : undefined;

    onApprove({
      comment: comment || undefined,
      lineAdjustments,
      deliveryDueDate: isSpFinalStep && deliveryDueDate ? deliveryDueDate : undefined,
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
      setActionError("Please add a rejection comment before rejecting.");
      return;
    }
    setConfirmAction("reject");
  }

  function handleConfirmAction() {
    if (confirmAction === "approve") submitApprove();
    if (confirmAction === "reject") submitReject();
    setConfirmAction(null);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Review order {orderNumber}</DialogTitle>
          <DialogDescription>
            Approve to advance the workflow chain or reject to cancel.
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[calc(90vh-9.5rem)] min-h-0 gap-4 overflow-hidden md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div className="min-h-0 space-y-4 overflow-y-auto pl-1 pr-2">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Type</dt>
                <dd>{BRANCH_ORDER_TYPE_LABELS[orderType] ?? orderType}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Branch</dt>
                <dd>{branchName}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  <Badge variant="outline" className={cn("font-normal", statusBadgeClassName)}>
                    {statusLabel}
                  </Badge>
                </dd>
              </div>
              {currentApprover ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Approver</dt>
                  <dd>{currentApprover}</dd>
                </div>
              ) : null}
              {afterApprove ? (
                <div className="rounded-md bg-muted/50 px-3 py-2 text-muted-foreground">{afterApprove}</div>
              ) : null}
            </dl>
            {isSpFinalStep ? (
              <div className="space-y-2">
                <Label htmlFor="delivery-due">Delivery due date (optional)</Label>
                <Input
                  id="delivery-due"
                  type="date"
                  value={deliveryDueDate}
                  onChange={(e) => setDeliveryDueDate(e.target.value)}
                />
                {deliveryDueWarning ? (
                  <p className="text-xs text-amber-600 dark:text-amber-500">{deliveryDueWarning}</p>
                ) : null}
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="order-comment">
                {isSpFinalStep ? "SPA remarks (optional)" : "Comment (optional)"}
              </Label>
              <Textarea
                id="order-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
              />
              {actionError ? <p className="text-xs text-destructive">{actionError}</p> : null}
            </div>
          </div>
          <div className="flex min-h-0 flex-col space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Order lines</Label>
              <span className="text-xs text-muted-foreground">Total {totalLines}</span>
            </div>
            <div className="min-h-0 max-h-[420px] flex-1 overflow-y-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="w-10 px-3 py-2 text-left font-medium">#</th>
                    <th className="px-3 py-2 text-left font-medium">SKU</th>
                    <th className="w-24 px-3 py-2 text-right font-medium">Qty</th>
                    {isSpFinalStep ? (
                      <th className="w-40 px-3 py-2 text-right font-medium">Approved qty</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => (
                    <tr key={line.detailId} className="border-t">
                      <td className="px-3 py-2 text-muted-foreground">{index + 1}</td>
                      <td className="px-3 py-2 font-mono">{line.skuCode}</td>
                      <td className="px-3 py-2 text-right">×{line.quantity}</td>
                      {isSpFinalStep ? (
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min={1}
                            max={line.quantity}
                            className="ml-auto h-8 w-24 text-right"
                            value={approvedQtyByLine[line.detailId] ?? line.quantity}
                            onChange={(e) =>
                              setApprovedQtyByLine((prev) => ({
                                ...prev,
                                [line.detailId]: Number(e.target.value),
                              }))
                            }
                          />
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Total lines: <span className="font-medium text-foreground">{totalLines}</span>
              {" • "}
              Total qty: <span className="font-medium text-foreground">{totalQuantity}</span>
            </div>
          </div>
        </div>
        <DialogFooter className="mt-1 gap-2 border-t pt-3 sm:justify-end">
          <Button
            variant="outline"
            disabled={pending}
            onClick={handleReject}
          >
            Reject
          </Button>
          <Button disabled={pending} onClick={handleApprove}>
            {pending ? "Saving…" : "Approve"}
          </Button>
        </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmAction !== null} onOpenChange={(nextOpen) => !nextOpen && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === "approve" ? "Approve this order?" : "Reject this order?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === "approve"
                ? "This will move the order to the next workflow step."
                : "This will reject and cancel the order request."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={handleConfirmAction}
              className={confirmAction === "reject" ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
            >
              {confirmAction === "approve" ? "Confirm approve" : "Confirm reject"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

const ORDER_STATUS_VARIANTS: Record<BranchOrderStatus, string> = {
  draft: "border-slate-200 bg-slate-50 text-slate-700",
  pending_ps: "border-amber-200 bg-amber-50 text-amber-800",
  pending_tl: "border-amber-200 bg-amber-50 text-amber-800",
  pending_sp: "border-amber-200 bg-amber-50 text-amber-800",
  pending_logistics: "border-amber-200 bg-amber-50 text-amber-800",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-800",
  rejected: "border-rose-200 bg-rose-50 text-rose-800",
  cancelled: "border-zinc-200 bg-zinc-100 text-zinc-700",
};
