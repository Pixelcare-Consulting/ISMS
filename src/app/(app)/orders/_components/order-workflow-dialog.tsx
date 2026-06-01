"use client";

import { useState } from "react";

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
import { BRANCH_ORDER_TYPE_LABELS } from "@/features/orders/constants/order-status";
import {
  getAfterApproveHint,
  getCurrentApproverLabel,
  getOrderStatusLabel,
} from "@/features/orders/constants/order-workflow";
import type { BranchOrderStatus, BranchOrderType } from "@prisma/client";

interface OrderWorkflowDialogProps {
  orderNumber: string;
  orderType: BranchOrderType;
  branchName: string;
  linesSummary: string;
  status: BranchOrderStatus;
  open: boolean;
  pending?: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: (comment?: string) => void;
  onReject: (comment?: string) => void;
}

export function OrderWorkflowDialog({
  orderNumber,
  orderType,
  branchName,
  linesSummary,
  status,
  open,
  pending,
  onOpenChange,
  onApprove,
  onReject,
}: OrderWorkflowDialogProps) {
  const [comment, setComment] = useState("");

  const statusLabel = getOrderStatusLabel(status);
  const currentApprover = getCurrentApproverLabel(status, orderType);
  const afterApprove = getAfterApproveHint(status, orderType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
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
            <dt className="text-muted-foreground">Lines</dt>
            <dd className="text-right font-mono">{linesSummary}</dd>
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
          <Label htmlFor="order-comment">Comment (optional)</Label>
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
          <Button disabled={pending} onClick={() => onApprove(comment || undefined)}>
            {pending ? "Saving…" : "Approve"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
