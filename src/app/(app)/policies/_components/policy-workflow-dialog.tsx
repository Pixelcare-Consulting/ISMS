"use client";

import { useState, useTransition } from "react";

import { toast } from "sonner";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface ApproverOption {
  id: string;
  name: string | null;
  email: string;
}

interface PolicyWorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "submit" | "approve" | "revert";
  policyId: string;
  approvers?: ApproverOption[];
  onSubmit: (input: {
    policyId: string;
    comment?: string;
    reviewerId?: string;
  }) => Promise<{ success?: boolean; error?: string }>;
  onSuccess?: () => void;
}

export function PolicyWorkflowDialog({
  open,
  onOpenChange,
  mode,
  policyId,
  approvers = [],
  onSubmit,
  onSuccess,
}: PolicyWorkflowDialogProps) {
  const [comment, setComment] = useState("");
  const [reviewerId, setReviewerId] = useState<string>("");
  const [pending, startTransition] = useTransition();

  const title =
    mode === "submit"
      ? "Submit for review"
      : mode === "approve"
        ? "Approve policy"
        : "Revert to draft";

  const description =
    mode === "submit"
      ? "Optionally assign a reviewer and add a comment for the approval trail."
      : mode === "approve"
        ? "Add an optional approval comment."
        : "Add a comment explaining why this policy is being reverted.";

  function handleConfirm() {
    startTransition(async () => {
      const result = await onSubmit({
        policyId,
        comment: comment.trim() || undefined,
        reviewerId: reviewerId || undefined,
      });

      if (result.error) {
        toast.error(`Could not ${mode} policy`, { description: result.error });
        return;
      }

      toast.success(
        mode === "submit"
          ? "Submitted for review"
          : mode === "approve"
            ? "Policy approved"
            : "Reverted to draft",
      );
      setComment("");
      setReviewerId("");
      onOpenChange(false);
      onSuccess?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {mode === "submit" && approvers.length > 0 ? (
            <div className="space-y-2">
              <Label>Reviewer (optional)</Label>
              <Select
                value={reviewerId || "none"}
                onValueChange={(value) =>
                  setReviewerId(value === "none" ? "" : value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any approver" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Any approver</SelectItem>
                  {approvers.map((approver) => (
                    <SelectItem key={approver.id} value={approver.id}>
                      {approver.name ?? approver.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="workflow-comment">Comment (optional)</Label>
            <Textarea
              id="workflow-comment"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              rows={4}
              maxLength={2000}
              placeholder={
                mode === "revert"
                  ? "Explain what needs to change…"
                  : "Add context for reviewers…"
              }
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={pending} onClick={handleConfirm}>
            {pending ? "Saving…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
