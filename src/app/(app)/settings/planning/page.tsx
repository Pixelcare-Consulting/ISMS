import Link from "next/link";

import {
  getPlanningDashboardAction,
  listAllocationGapsAction,
  listBranchesForPlanningAction,
  listPlanningPeriodsAction,
  listPlanningTargetsAction,
} from "@/features/forecast/actions/forecast.actions";
import { ModuleGuide } from "@/components/module-guide";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { PLANNING_MODULE_GUIDE } from "@/content/module-guides/planning";
import { PLANNING_PAGE_TUTORIAL } from "@/content/page-tutorials/planning";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { PlanningPanel } from "@/app/(app)/settings/planning/_components/planning-panel";
import { Button } from "@/components/ui/button";

interface PlanningPageProps {
  searchParams: Promise<{
    page?: string;
    limit?: string;
    branch?: string;
    q?: string;
    sort?: string;
    dir?: string;
    period?: string;
  }>;
}

function planningHref(
  hash: string,
  periodId: string | undefined,
  filters: { branch?: string; q?: string; sort?: string; dir?: string; limit?: string },
) {
  const params = new URLSearchParams();
  if (periodId) params.set("period", periodId);
  if (filters.branch) params.set("branch", filters.branch);
  if (filters.q) params.set("q", filters.q);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.sort && filters.dir) params.set("dir", filters.dir);
  if (filters.limit) params.set("limit", filters.limit);
  const qs = params.toString();
  return `/settings/planning${qs ? `?${qs}` : ""}${hash}`;
}

export default async function PlanningPage({ searchParams }: PlanningPageProps) {
  await requireAnyPermission(["forecast.manage", "planogram.manage"]);

  const params = await searchParams;
  const gapPage = Number(params.page) || 1;
  const gapLimit = parseTablePageSize(params.limit);

  const [periods, dashboard, branches] = await Promise.all([
    listPlanningPeriodsAction(),
    getPlanningDashboardAction(params.period),
    listBranchesForPlanningAction(),
  ]);

  const period = dashboard.period;

  const [targets, gapsResult] = period
    ? await Promise.all([
        listPlanningTargetsAction(period.id),
        listAllocationGapsAction(period.id, {
          page: gapPage,
          limit: gapLimit,
          branchId: params.branch,
          q: params.q,
          sort: params.sort,
          sortDir: params.dir,
        }),
      ])
    : [
        [],
        { items: [], total: 0, page: 1, limit: gapLimit, totalPages: 1 },
      ];

  const clientPeriod = period
    ? { id: period.id, label: period.label, isActive: period.isActive }
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
    limit: gapsResult.limit,
    totalPages: gapsResult.totalPages,
  };

  const filterState = {
    branch: params.branch,
    q: params.q,
    sort: params.sort,
    dir: params.dir,
    limit: params.limit,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Planning & Forecast"
        tutorial={PLANNING_PAGE_TUTORIAL}
        description="Run shelf allocation, and generate suggested auto-replenish orders."
        sticky={false}
        actions={
          <Button variant="outline" asChild>
            <Link href="/planning/suggested-orders">Suggested orders</Link>
          </Button>
        }
      />
      <ModuleGuide {...PLANNING_MODULE_GUIDE} />
      <PlanningPanel
        period={clientPeriod}
        periods={periods}
        gapCount={dashboard.gapCount}
        allocationRowCount={dashboard.allocationRowCount}
        draftOrders={dashboard.draftOrders}
        targetBranchCount={dashboard.targetBranchCount}
        tenantBranchCount={dashboard.tenantBranchCount}
        kpiHrefs={{
          totalBranches: planningHref("#branch-targets", period?.id, filterState),
          gaps: planningHref("#allocation-gaps", period?.id, filterState),
          drafts: "/planning/suggested-orders",
        }}
        targets={targets}
        gapsResult={clientGaps}
        branches={branches}
        currentBranch={params.branch}
        currentQ={params.q}
        initialSort={params.sort ?? ""}
        initialSortDir={params.dir ?? "desc"}
        gapsPreserveParams={period ? { period: period.id } : undefined}
        periodPreserveParams={Object.fromEntries(
          Object.entries({
            branch: params.branch,
            q: params.q,
            sort: params.sort,
            dir: params.sort ? params.dir : undefined,
            limit: params.limit,
          }).filter((entry): entry is [string, string] => Boolean(entry[1])),
        )}
      />
    </div>
  );
}
