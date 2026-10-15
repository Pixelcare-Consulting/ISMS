import type { DemandPlanningRunStatus } from "@prisma/client";

/** Non-released runs (Draft, Generated, Recalculated) may be deleted. */
export function isDemandPlanningRunDeletable(status: DemandPlanningRunStatus): boolean {
  return status !== "released";
}
