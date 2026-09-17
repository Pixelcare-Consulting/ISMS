"use client";

import { useTransition } from "react";
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
import { releaseDemandPlanRunAction } from "@/features/demand-planning/actions/demand-planning.actions";

export function DemandPlanningReleaseButton({
  runId,
  documentNumber,
  disabled,
  onReleased,
}: {
  runId: string;
  documentNumber: string;
  disabled?: boolean;
  onReleased?: () => void;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button disabled={disabled || pending}>Release to Ordering</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Release {documentNumber}?</AlertDialogTitle>
          <AlertDialogDescription>
            Drop 1 quantities freeze on this document. One auto-replenish draft is created per
            planned branch (zero and no-history branches are skipped). Released plans are never
            overwritten.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              startTransition(async () => {
                const result = await releaseDemandPlanRunAction(runId);
                if ("error" in result && result.error) {
                  toast.error(result.error);
                  return;
                }
                if (!("orders" in result)) return;
                toast.success(
                  `Released ${result.orders.length} auto-replenish draft${result.orders.length === 1 ? "" : "s"}`,
                );
                onReleased?.();
              });
            }}
          >
            Release
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
