import type { DemandPlanningPlanStatus, DemandPlanningRunStatus } from "@prisma/client";

import { Badge } from "@/components/ui/badge";

const RUN_STATUS_LABEL: Record<DemandPlanningRunStatus, string> = {
  draft: "Draft",
  generated: "Generated",
  released: "Released",
  superseded: "Recalculated",
};

const PLAN_STATUS_LABEL: Record<DemandPlanningPlanStatus, string> = {
  planned: "Planned",
  no_history: "No history",
  awaiting: "Awaiting",
};

export function DemandPlanningRunStatusBadge({
  status,
}: {
  status: DemandPlanningRunStatus;
}) {
  if (status === "superseded") {
    return (
      <Badge
        variant="outline"
        className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
      >
        {RUN_STATUS_LABEL[status]}
      </Badge>
    );
  }
  const variant =
    status === "released" ? "default" : status === "generated" ? "secondary" : "outline";
  return <Badge variant={variant}>{RUN_STATUS_LABEL[status]}</Badge>;
}

export function DemandPlanningPlanStatusBadge({
  status,
}: {
  status: DemandPlanningPlanStatus;
}) {
  const variant =
    status === "planned" ? "secondary" : status === "no_history" ? "outline" : "outline";
  return <Badge variant={variant}>{PLAN_STATUS_LABEL[status]}</Badge>;
}
