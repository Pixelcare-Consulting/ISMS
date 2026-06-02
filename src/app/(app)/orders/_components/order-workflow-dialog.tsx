"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
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
import type { BranchOrderStatus, BranchOrderType } from "@prisma/client";

export interface OrderWorkflowLine {
  detailId: string;
  skuCode: string;
  quantity: number;
}

interface OrderWorkflowDialogProps {
  orderNumber: string;
  orderType: BranchOrderType;
  branchName: string;
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
  const [approvedQtyByLine, setApprovedQtyByLine] = useState<Record<string, number>>({});

  const isSpFinalStep = isSupplyPlanningApprovalStep(status, orderType);
  const statusLabel = getOrderStatusLabel(status);
  const currentApprover = getCurrentApproverLabel(status, orderType);
  const afterApprove = getAfterApproveHint(status, orderType);

  useEffect(() => {
    if (!open) return;
    setComment("");
    setDeliveryDueDate("");
    setApprovedQtyByLine(
      Object.fromEntries(lines.map((l) => [l.detailId, l.quantity])),
    );
  }, [open, lines]);

  function handleApprove() {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Review order {orderNumber}</DialogTitle>
          <DialogDescription>
            Approve to advance the workflow chain or reject to cancel.
          </DialogDescription>
        </DialogHeader>
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
            <dd>{statusLabel}</dd>
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
        <div className="space-y-2">
          <Label>Order lines</Label>
          <ul className="space-y-2 rounded-md border p-3 text-sm">
            {lines.map((line) => (
              <li key={line.detailId} className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono">{line.skuCode}</span>
                {isSpFinalStep ? (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs">Ordered {line.quantity}</span>
                    <Input
                      type="number"
                      min={1}
                      max={line.quantity}
                      className="h-8 w-20"
                      value={approvedQtyByLine[line.detailId] ?? line.quantity}
                      onChange={(e) =>
                        setApprovedQtyByLine((prev) => ({
                          ...prev,
                          [line.detailId]: Number(e.target.value),
                        }))
                      }
                    />
                    <span className="text-xs text-muted-foreground">Approved</span>
                  </div>
                ) : (
                  <span>×{line.quantity}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
        {isSpFinalStep ? (
          <div className="space-y-2">
            <Label htmlFor="delivery-due">Delivery due date (optional)</Label>
            <Input
              id="delivery-due"
              type="date"
              value={deliveryDueDate}
              onChange={(e) => setDeliveryDueDate(e.target.value)}
            />
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
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => onReject(comment || undefined)}
          >
            Reject
          </Button>
          <Button disabled={pending} onClick={handleApprove}>
            {pending ? "Saving…" : "Approve"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
