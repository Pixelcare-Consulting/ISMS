import Link from "next/link";

import {
  getPlanningDashboardAction,
  listAllocationGapsAction,
  listBranchesForPlanningAction,
  listPlanningTargetsAction,
} from "@/features/forecast/actions/forecast.actions";
import { forecastService } from "@/features/forecast/services/forecast.service";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { PlanningPanel } from "@/app/(app)/settings/planning/_components/planning-panel";
import { Button } from "@/components/ui/button";

interface PlanningPageProps {
  searchParams: Promise<{
    page?: string;
    branch?: string;
    q?: string;
  }>;
}

export default async function PlanningPage({ searchParams }: PlanningPageProps) {
  await requireAnyPermission(["forecast.manage", "planogram.manage"]);

  const params = await searchParams;
  const gapPage = Number(params.page) || 1;

  const dashboard = await getPlanningDashboardAction();
  const period = dashboard.period;

  const [targets, gapsResult, branches] = period
    ? await Promise.all([
        listPlanningTargetsAction(period.id),
        listAllocationGapsAction(period.id, {
          page: gapPage,
          branchId: params.branch,
          q: params.q,
        }),
        listBranchesForPlanningAction(),
      ])
    : [[], { items: [], total: 0, page: 1, limit: 25, totalPages: 1 }, []];

  const formattedTargets = targets.map((t) => ({
    id: t.id,
    revenueLabel: forecastService.formatRevenueTarget(t.revenueTarget),
    branch: { name: t.branch.name, sapCode: t.branch.sapCode },
  }));

  const clientPeriod = period
    ? {
        id: period.id,
        label: period.label,
        isActive: period.isActive,
        _count: period._count,
      }
    : null;

  const clientGaps = {
    items: gapsResult.items.map((g) => ({
      id: g.id,
      gapQty: g.gapQty,
      planogramMax: g.planogramMax,
      currentStock: g.currentStock,
      branch: { name: g.branch.name },
      model: { skuCode: g.model.skuCode, name: g.model.name },
    })),
    total: gapsResult.total,
    page: gapsResult.page,
    totalPages: gapsResult.totalPages,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Planning & Forecast"
        description="Run shelf allocation, and generate suggested auto-replenish orders."
        actions={
          <Button variant="outline" asChild>
            <Link href="/planning/suggested-orders">Suggested orders</Link>
          </Button>
        }
      />
      <PlanningPanel
        period={clientPeriod}
        gapCount={dashboard.gapCount}
        draftOrders={dashboard.draftOrders}
        targets={formattedTargets}
        gapsResult={clientGaps}
        branches={branches}
        currentBranch={params.branch}
        currentQ={params.q}
      />
    </div>
  );
}
