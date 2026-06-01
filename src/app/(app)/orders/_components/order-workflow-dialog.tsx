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

interface OrderWorkflowDialogProps {
  orderNumber: string;
  status: string;
  open: boolean;
  pending?: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: (comment?: string) => void;
  onReject: (comment?: string) => void;
}

export function OrderWorkflowDialog({
  orderNumber,
  status,
  open,
  pending,
  onOpenChange,
  onApprove,
  onReject,
}: OrderWorkflowDialogProps) {
  const [comment, setComment] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Review order {orderNumber}</DialogTitle>
          <DialogDescription>
            Current status: {status}. Approve to advance the workflow chain or reject to cancel.
          </DialogDescription>
        </DialogHeader>
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
