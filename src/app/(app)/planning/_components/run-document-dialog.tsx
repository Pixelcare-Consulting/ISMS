"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { DemandPlanningChromeBar } from "@/app/(app)/planning/_components/demand-planning-chrome-bar";
import { DemandPlanningRunDocument } from "@/app/(app)/planning/runs/[runId]/_components/run-document";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { getDemandPlanningRunGridAction } from "@/features/demand-planning/actions/demand-planning.actions";
import type {
  DemandPlanningClientRun,
  DemandPlanningGridLine,
} from "@/features/demand-planning/types/run.types";

type RunDocumentPayload = {
  run: DemandPlanningClientRun;
  branchId: string | null;
  lines: DemandPlanningGridLine[];
};

export function RunDocumentDialog({
  runId,
  onOpenChange,
  onRunChanged,
  canManage,
  canRelease,
  actorName,
}: {
  runId: string | null;
  onOpenChange: (open: boolean) => void;
  onRunChanged: (nextRunId: string) => void;
  canManage: boolean;
  canRelease: boolean;
  actorName: string;
}) {
  const open = Boolean(runId);
  const [payload, setPayload] = useState<RunDocumentPayload | null>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  useEffect(() => {
    if (!runId) {
      setPayload(null);
      return;
    }

    let cancelled = false;
    setPayload(null);

    void (async () => {
      const result = await getDemandPlanningRunGridAction(runId);
      if (cancelled) return;
      if ("error" in result) {
        toast.error(result.error || "Demand planning run not found");
        onOpenChangeRef.current(false);
        return;
      }
      if (!result.run) {
        toast.error("Demand planning run not found");
        onOpenChangeRef.current(false);
        return;
      }
      setPayload({
        run: result.run,
        branchId: result.branchId ?? null,
        lines: result.lines,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [runId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[calc(100svh-1rem)] w-[calc(100%-1rem)] max-h-[calc(100svh-1rem)] max-w-none flex-col gap-0 overflow-hidden overflow-y-hidden p-0 sm:max-w-none"
      >
        <DialogTitle className="sr-only">Demand planning run</DialogTitle>
        <DialogDescription className="sr-only">
          Review the Drop 1 grid, then release, recalculate, or export.
        </DialogDescription>
        {payload ? (
          <DemandPlanningRunDocument
            key={payload.run.id}
            run={payload.run}
            initialBranchId={payload.branchId}
            initialLines={payload.lines}
            canManage={canManage}
            canRelease={canRelease}
            actorName={actorName}
            onClose={() => onOpenChange(false)}
            onRunChanged={onRunChanged}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <DemandPlanningChromeBar
              crumbs={[
                { label: "Settings" },
                { label: "Demand Planning" },
                { label: "Loading…" },
              ]}
              actorName={actorName}
              onClose={() => onOpenChange(false)}
            />
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Loading plan…
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
