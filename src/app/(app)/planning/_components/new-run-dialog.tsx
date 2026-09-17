"use client";

import { NewRunWizard } from "@/app/(app)/planning/_components/new-run-wizard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  DemandPlanningWizardBranch,
  DemandPlanningWizardDealer,
  DemandPlanningWizardPeriod,
} from "@/features/demand-planning/types/run.types";

export function NewRunDialog({
  open,
  onOpenChange,
  actorName,
  periods,
  dealers,
  branches,
  onOpenDocument,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actorName: string;
  periods: DemandPlanningWizardPeriod[];
  dealers: DemandPlanningWizardDealer[];
  branches: DemandPlanningWizardBranch[];
  onOpenDocument?: (runId: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[90vh] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
      >
        <DialogTitle className="sr-only">New demand planning run</DialogTitle>
        <DialogDescription className="sr-only">
          Choose scope and parameters, confirm data sources, then review the generated plan.
        </DialogDescription>
        {open ? (
          <NewRunWizard
            embedded
            actorName={actorName}
            periods={periods}
            dealers={dealers}
            branches={branches}
            onClose={() => onOpenChange(false)}
            onOpenDocument={onOpenDocument}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
