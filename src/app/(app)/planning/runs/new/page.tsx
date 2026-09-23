import { redirect } from "next/navigation";

import { DEMAND_PLANNING_RUNS_PATH, demandPlanningRunsHref } from "@/features/demand-planning/lib/paths";
import { canManageDemandPlanning } from "@/features/demand-planning/lib/permissions";
import { requireAuth } from "@/lib/auth/permissions";

export default async function NewDemandPlanningRunPage() {
  const session = await requireAuth();
  if (!canManageDemandPlanning(session.user.permissions)) {
    redirect(`${DEMAND_PLANNING_RUNS_PATH}?error=forbidden`);
  }

  redirect(demandPlanningRunsHref({ newRun: true }));
}
