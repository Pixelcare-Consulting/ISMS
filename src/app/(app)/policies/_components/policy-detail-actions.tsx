"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { toast } from "sonner";

import { PolicyWorkflowDialog } from "@/app/(app)/policies/_components/policy-workflow-dialog";
import type { PolicyStatus } from "@/features/policies/constants/policy-status";
import { DeleteConfirmDialog } from "@/components/data-table/delete-confirm-dialog";
import { Button } from "@/components/ui/button";

interface ApproverOption {
  id: string;
  name: string | null;
  email: string;
}

interface PolicyDetailActionsProps {
  policyId: string;
  status: PolicyStatus;
  canCreate: boolean;
  canApprove: boolean;
  approvers: ApproverOption[];
  createRevisionAction: (
    policyId: string,
  ) => Promise<{ success?: boolean; error?: string }>;
  submitForReviewAction: (input: {
    policyId: string;
    comment?: string;
    reviewerId?: string;
  }) => Promise<{ success?: boolean; error?: string }>;
  approvePolicyAction: (input: {
    policyId: string;
    comment?: string;
  }) => Promise<{ success?: boolean; error?: string }>;
  revertPolicyToDraftAction: (input: {
    policyId: string;
    comment?: string;
  }) => Promise<{ success?: boolean; error?: string }>;
  deletePolicyAction: (
    policyId: string,
  ) => Promise<{ success?: boolean; error?: string }>;
}

export function PolicyDetailActions({
  policyId,
  status,
  canCreate,
  canApprove,
  approvers,
  createRevisionAction,
  submitForReviewAction,
  approvePolicyAction,
  revertPolicyToDraftAction,
  deletePolicyAction,
}: PolicyDetailActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [workflowMode, setWorkflowMode] = useState<
    "submit" | "approve" | "revert" | null
  >(null);

  function refresh() {
    router.refresh();
  }

  function runSimpleAction(
    label: string,
    action: () => Promise<{ success?: boolean; error?: string }>,
    onSuccess?: () => void,
  ) {
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        toast.error(`Could not ${label}`, { description: result.error });
        return;
      }
      toast.success(label);
      onSuccess?.();
      refresh();
    });
  }

  function handleDeleteConfirm() {
    runSimpleAction("Policy deleted", () => deletePolicyAction(policyId), () => {
      setDeleteOpen(false);
      router.push("/policies");
    });
  }

  function handleNewRevision() {
    runSimpleAction("Revision created", () => createRevisionAction(policyId));
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {status === "approved" && canCreate ? (
          <Button type="button" disabled={pending} onClick={handleNewRevision}>
            New revision
          </Button>
        ) : null}
        {status === "draft" && canCreate ? (
          <Button
            type="button"
            disabled={pending}
            onClick={() => setWorkflowMode("submit")}
          >
            Submit for review
          </Button>
        ) : null}
        {status === "review" && canApprove ? (
          <Button
            type="button"
            disabled={pending}
            onClick={() => setWorkflowMode("approve")}
          >
            Approve
          </Button>
        ) : null}
        {status === "review" && canCreate ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => setWorkflowMode("revert")}
          >
            Revert to draft
          </Button>
        ) : null}
        {status !== "approved" && canCreate ? (
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() => setDeleteOpen(true)}
          >
            Delete
          </Button>
        ) : null}
      </div>

      {workflowMode === "submit" ? (
        <PolicyWorkflowDialog
          open
          onOpenChange={(open) => !open && setWorkflowMode(null)}
          mode="submit"
          policyId={policyId}
          approvers={approvers}
          onSubmit={submitForReviewAction}
          onSuccess={refresh}
        />
      ) : null}

      {workflowMode === "approve" ? (
        <PolicyWorkflowDialog
          open
          onOpenChange={(open) => !open && setWorkflowMode(null)}
          mode="approve"
          policyId={policyId}
          onSubmit={approvePolicyAction}
          onSuccess={refresh}
        />
      ) : null}

      {workflowMode === "revert" ? (
        <PolicyWorkflowDialog
          open
          onOpenChange={(open) => !open && setWorkflowMode(null)}
          mode="revert"
          policyId={policyId}
          onSubmit={revertPolicyToDraftAction}
          onSuccess={refresh}
        />
      ) : null}

      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete policy"
        description="This permanently removes the policy. This cannot be undone."
        pending={pending}
        onConfirm={handleDeleteConfirm}
      />
    </>
  );
}
