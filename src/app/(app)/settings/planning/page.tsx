import Link from "next/link";

import {
  getPlanningDashboardAction,
  listPlanningPeriodsAction,
  listPlanningTargetsAction,
} from "@/features/forecast/actions/forecast.actions";
import { displayPeriodLabel } from "@/features/demand-planning/lib/planning-period-dates";
import { ModuleGuide } from "@/components/module-guide";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { PLANNING_MODULE_GUIDE } from "@/content/module-guides/planning";
import { PLANNING_PAGE_TUTORIAL } from "@/content/page-tutorials/planning";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { PlanningPanel } from "@/app/(app)/settings/planning/_components/planning-panel";
import { Button } from "@/components/ui/button";

interface PlanningPageProps {
  searchParams: Promise<{
    period?: string;
  }>;
}

export default async function PlanningPage({ searchParams }: PlanningPageProps) {
  await requireAnyPermission(["forecast.manage", "planogram.manage"]);

  const params = await searchParams;

  const [periods, dashboard] = await Promise.all([
    listPlanningPeriodsAction(),
    getPlanningDashboardAction(params.period),
  ]);

  const period = dashboard.period;

  const targets = period ? await listPlanningTargetsAction(period.id) : [];

  const clientPeriod = period
    ? {
        id: period.id,
        label: displayPeriodLabel(period.label),
        isActive: period.isActive,
      }
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Planning & Forecast"
        tutorial={PLANNING_PAGE_TUTORIAL}
        description="Import the SFE forecast to set Target Quota automatically, then switch the active period. Demand Planning runs live under Settings → Planning."
        sticky={false}
        actions={
          <Button variant="outline" asChild>
            <Link href="/settings/planning/runs">Demand Planning</Link>
          </Button>
        }
      />
      <ModuleGuide {...PLANNING_MODULE_GUIDE} />
      <PlanningPanel
        period={clientPeriod}
        periods={periods}
        targetBranchCount={dashboard.targetBranchCount}
        tenantBranchCount={dashboard.tenantBranchCount}
        targets={targets}
      />
    </div>
  );
}
