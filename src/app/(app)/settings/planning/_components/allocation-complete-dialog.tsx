"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { generateSuggestedOrdersAction } from "@/features/forecast/actions/forecast.actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface AllocationCompleteResult {
  gapCount: number;
  totalGapUnits: number;
}

export function AllocationCompleteDialog({
  open,
  onOpenChange,
  periodId,
  result,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  periodId: string;
  result: AllocationCompleteResult | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const gapCount = result?.gapCount ?? 0;
  const totalGapUnits = result?.totalGapUnits ?? 0;
  const hasGaps = gapCount > 0;

  function handleGenerate() {
    if (!hasGaps) return;
    startTransition(async () => {
      const generated = await generateSuggestedOrdersAction(periodId);
      if ("error" in generated) {
        toast.error(generated.error);
        return;
      }
      const count = generated.orders.length;
      toast.success(
        count === 1
          ? "1 suggested draft created"
          : `${count} suggested drafts created`,
      );
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (pending) return;
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        showCloseButton={!pending}
        onPointerDownOutside={(event) => {
          if (pending) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (pending) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Allocation complete</DialogTitle>
          <DialogDescription>
            {hasGaps ? (
              <>
                Found <strong>{gapCount}</strong> shelf{" "}
                {gapCount === 1 ? "gap" : "gaps"} (
                <strong>{totalGapUnits.toLocaleString("en-PH")}</strong>{" "}
                {totalGapUnits === 1 ? "unit" : "units"}). Generate suggested
                auto-replenish drafts now?
              </>
            ) : (
              <>
                There are no shelf gaps for this period. Generate is unavailable
                until allocation finds a gap.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Skip
          </Button>
          <Button onClick={handleGenerate} disabled={pending || !hasGaps}>
            {pending ? "Generating…" : "Generate suggested orders"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
