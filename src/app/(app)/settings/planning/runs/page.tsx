import { redirect } from "next/navigation";

import { PageHeader } from "@/app/(app)/_components/page-header";
import { DemandPlanningRunList } from "@/app/(app)/planning/_components/run-list";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import {
  getDemandPlanningAccessAction,
  listDemandPlanningPeriodsAction,
  listDemandPlanningRunsAction,
  listDemandPlanningWizardOptionsAction,
} from "@/features/demand-planning/actions/demand-planning.actions";
import { canViewDemandPlanning } from "@/features/demand-planning/lib/permissions";
import { requireAuth } from "@/lib/auth/permissions";

interface DemandPlanningRunsPageProps {
  searchParams: Promise<{
    page?: string;
    limit?: string;
    period?: string;
    new?: string;
    run?: string;
  }>;
}

export default async function DemandPlanningRunsPage({
  searchParams,
}: DemandPlanningRunsPageProps) {
  const session = await requireAuth();
  if (!canViewDemandPlanning(session.user.permissions)) {
    redirect("/dashboard?error=forbidden");
  }

  const params = await searchParams;
  const page = Number(params.page) || 1;
  const limit = parseTablePageSize(params.limit);
  const [access, periods, runs] = await Promise.all([
    getDemandPlanningAccessAction(),
    listDemandPlanningPeriodsAction(),
    listDemandPlanningRunsAction({
      page,
      limit,
      periodId: params.period,
    }),
  ]);

  const wizardOptions = access.canManage ? await listDemandPlanningWizardOptionsAction() : null;
  const actorName = session.user.name?.trim() || session.user.email || "Signed in";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Demand Planning"
        description="Generate a run, review the grid, then release to auto-replenish."
      />
      <DemandPlanningRunList
        items={runs.items}
        total={runs.total}
        page={runs.page}
        limit={limit}
        totalPages={runs.totalPages}
        periods={periods}
        selectedPeriodId={params.period}
        canManage={access.canManage}
        canRelease={access.canRelease}
        actorName={actorName}
        wizardOptions={wizardOptions ?? undefined}
        initialNewRunOpen={access.canManage && params.new === "1" && !params.run}
        initialRunId={params.run}
      />
    </div>
  );
}
