"use client";

import type { DemandPlanningPlanStatus } from "@prisma/client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  previewDemandPlanReleaseAction,
  releaseDemandPlanRunAction,
} from "@/features/demand-planning/actions/demand-planning.actions";
import type { DemandPlanReleasePreview } from "@/features/demand-planning/types/run.types";

const LIST_CAP = 8;

export type ReleaseBranchHint = {
  sapCode: string;
  name: string;
  planStatus: DemandPlanningPlanStatus;
  drop1Qty: number;
};

function formatSkipSummary(
  skipped: Array<{ branchName: string; reason: string }> | undefined,
): string {
  if (!skipped || skipped.length === 0) {
    return "No branches had Drop 1 quantity to send (or each already has an open Auto Replenish for this period).";
  }
  const byReason = new Map<string, number>();
  for (const item of skipped) {
    byReason.set(item.reason, (byReason.get(item.reason) ?? 0) + 1);
  }
  return [...byReason.entries()]
    .map(([reason, count]) => `${count} skipped (${reason})`)
    .join(" · ");
}

function branchLabel(branch: ReleaseBranchHint): string {
  return `${branch.sapCode} ${branch.name}`;
}

/** Client-side hint before the server preview loads (open orders unknown). */
function hintPreview(branches: ReleaseBranchHint[] | undefined): DemandPlanReleasePreview | null {
  if (!branches || branches.length === 0) return null;
  const willRelease: DemandPlanReleasePreview["willRelease"] = [];
  const noHistory: DemandPlanReleasePreview["noHistory"] = [];
  const noDrop1: DemandPlanReleasePreview["noDrop1"] = [];
  const openOrder: DemandPlanReleasePreview["openOrder"] = [];

  for (const branch of branches) {
    const name = branchLabel(branch);
    if (branch.drop1Qty <= 0) {
      noDrop1.push({ branchName: name });
      continue;
    }
    willRelease.push({ branchName: name });
    if (branch.planStatus === "no_history") {
      noHistory.push({ branchName: name });
    }
  }

  return { willRelease, noHistory, noDrop1, openOrder };
}

function BranchNameList({
  title,
  items,
}: {
  title: string;
  items: Array<{ branchName: string; detail?: string }>;
}) {
  if (items.length === 0) return null;
  const shown = items.slice(0, LIST_CAP);
  const remaining = items.length - shown.length;
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">{title}</p>
      <ul className="text-muted-foreground max-h-28 space-y-0.5 overflow-y-auto text-sm">
        {shown.map((item) => (
          <li key={item.branchName}>
            {item.branchName}
            {item.detail ? ` (${item.detail})` : ""}
          </li>
        ))}
      </ul>
      {remaining > 0 ? (
        <p className="text-muted-foreground text-xs">and {remaining} more</p>
      ) : null}
    </div>
  );
}

export function DemandPlanningReleaseButton({
  runId,
  documentNumber,
  disabled,
  branches,
  onReleased,
}: {
  runId: string;
  documentNumber: string;
  disabled?: boolean;
  /** Branch hints from the open document (plan status + Drop 1 totals). */
  branches?: ReleaseBranchHint[];
  onReleased?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [preview, setPreview] = useState<DemandPlanReleasePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewRequestId = useRef(0);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      previewRequestId.current += 1;
      setLoadingPreview(false);
      setPreviewError(null);
      return;
    }

    const requestId = previewRequestId.current + 1;
    previewRequestId.current = requestId;
    setPreview(hintPreview(branches));
    setPreviewError(null);
    setLoadingPreview(true);

    void previewDemandPlanReleaseAction(runId).then((result) => {
      if (previewRequestId.current !== requestId) return;
      setLoadingPreview(false);
      if ("error" in result && result.error) {
        setPreviewError(result.error);
        return;
      }
      if ("preview" in result && result.preview) {
        setPreview(result.preview);
      }
    });
  }

  const willReleaseCount = preview?.willRelease.length ?? 0;
  const skippedCount = (preview?.noDrop1.length ?? 0) + (preview?.openOrder.length ?? 0);
  const noHistoryCount = preview?.noHistory.length ?? 0;

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button disabled={disabled || pending}>Release to Ordering</Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>
            Are you sure you want to proceed with this Release? ({documentNumber})
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-left">
              <p>
                Drop 1 quantities freeze on this document. Branches with Drop 1 above zero go
                straight to Team Leader as Auto Replenish. You can still release when some
                branches have no sales history.
              </p>
              {loadingPreview && !preview ? (
                <p className="text-muted-foreground text-sm">Checking branches…</p>
              ) : null}
              {previewError ? (
                <p className="text-destructive text-sm">{previewError}</p>
              ) : null}
              {preview ? (
                <>
                  <p className="text-foreground text-sm font-medium">
                    {willReleaseCount} → Team Leader
                    {skippedCount > 0 ? ` · ${skippedCount} skipped` : ""}
                    {noHistoryCount > 0 ? ` · ${noHistoryCount} no sales history` : ""}
                    {loadingPreview ? " (updating…)" : ""}
                  </p>
                  <BranchNameList
                    title="No sales history (still release)"
                    items={preview.noHistory}
                  />
                  <BranchNameList title="No Drop 1 (skip)" items={preview.noDrop1} />
                  <BranchNameList
                    title="Open Auto Replenish for this period (skip)"
                    items={preview.openOrder.map((item) => ({
                      branchName: item.branchName,
                      detail: item.detail ? `open ${item.detail}` : undefined,
                    }))}
                  />
                </>
              ) : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={Boolean(previewError) || pending}
            onClick={() => {
              startTransition(async () => {
                const result = await releaseDemandPlanRunAction(runId);
                if ("error" in result && result.error) {
                  toast.error(result.error);
                  return;
                }
                if (!("orders" in result)) return;
                const count = result.orders.length;
                onReleased?.();
                if (count === 0) {
                  toast.warning("No Auto Replenish orders sent to Team Leader", {
                    description: formatSkipSummary(
                      "skipped" in result ? result.skipped : undefined,
                    ),
                  });
                  return;
                }
                toast.success(
                  `Released ${count} Auto Replenish order${count === 1 ? "" : "s"} to Team Leader`,
                  {
                    description: "Open Auto Replenish to approve.",
                    action: {
                      label: "Open Auto Replenish",
                      onClick: () => router.push("/orders/auto-replenish"),
                    },
                  },
                );
                router.push("/orders/auto-replenish");
              });
            }}
          >
            Yes, release
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
