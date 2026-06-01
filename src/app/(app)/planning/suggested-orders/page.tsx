import Link from "next/link";

import {
  getPlanningDashboardAction,
  listAllocationGapsAction,
  listBranchesForPlanningAction,
  listDraftSuggestedOrdersAction,
} from "@/features/forecast/actions/forecast.actions";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { SuggestedOrdersTable } from "@/app/(app)/planning/suggested-orders/_components/suggested-orders-table";
import { Button } from "@/components/ui/button";

interface SuggestedOrdersPageProps {
  searchParams: Promise<{
    page?: string;
    gapsPage?: string;
    branch?: string;
    q?: string;
    draftBranch?: string;
    draftQ?: string;
  }>;
}

function buildPreserveParams(params: Record<string, string | undefined>) {
  const preserved: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value) preserved[key] = value;
  }
  return preserved;
}

export default async function SuggestedOrdersPage({ searchParams }: SuggestedOrdersPageProps) {
  await requireAnyPermission(["forecast.manage", "planogram.manage"]);

  const params = await searchParams;
  const draftPage = Number(params.page) || 1;
  const gapsPage = Number(params.gapsPage) || 1;

  const dashboard = await getPlanningDashboardAction();

  const [draftsResult, gapsResult, branches] = await Promise.all([
    listDraftSuggestedOrdersAction({
      page: draftPage,
      branchId: params.draftBranch,
      q: params.draftQ,
    }),
    dashboard.period != null
      ? listAllocationGapsAction(dashboard.period.id, {
          page: gapsPage,
          branchId: params.branch,
          q: params.q,
        })
      : Promise.resolve({ items: [], total: 0, page: 1, limit: 25, totalPages: 1 }),
    listBranchesForPlanningAction(),
  ]);

  const gapsPreserveParams = buildPreserveParams({
    page: draftPage > 1 ? String(draftPage) : undefined,
    draftBranch: params.draftBranch,
    draftQ: params.draftQ,
  });

  const draftsPreserveParams = buildPreserveParams({
    gapsPage: gapsPage > 1 ? String(gapsPage) : undefined,
    branch: params.branch,
    q: params.q,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suggested orders"
        description="Auto-replenish draft orders generated from allocation gaps. Submit for TL review when ready."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/settings/planning">Planning</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/orders">All orders</Link>
            </Button>
          </div>
        }
      />
      <SuggestedOrdersTable
        draftsResult={draftsResult}
        gapsResult={{
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
        }}
        branches={branches}
        periodId={dashboard.period?.id ?? null}
        currentDraftBranch={params.draftBranch}
        currentDraftQ={params.draftQ}
        currentGapBranch={params.branch}
        currentGapQ={params.q}
        draftsPreserveParams={draftsPreserveParams}
        gapsPreserveParams={gapsPreserveParams}
      />
    </div>
  );
}
