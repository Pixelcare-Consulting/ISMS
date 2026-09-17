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

const REPLENISHMENT_STATUS_LABEL = {
  generated: "Generated",
  awaiting_history: "Awaiting history",
} as const;

export function DemandPlanningRunStatusBadge({
  status,
}: {
  status: DemandPlanningRunStatus;
}) {
  const variant =
    status === "released"
      ? "default"
      : status === "generated"
        ? "secondary"
        : status === "superseded"
          ? "outline"
          : "outline";
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

export function ReplenishmentPlanStatusBadge({
  status,
}: {
  status: "generated" | "awaiting_history";
}) {
  return (
    <Badge variant={status === "generated" ? "secondary" : "outline"}>
      {REPLENISHMENT_STATUS_LABEL[status]}
    </Badge>
  );
}
