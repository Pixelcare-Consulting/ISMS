import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/app/(app)/_components/page-header";
import { ReplenishmentWorkbench } from "@/app/(app)/planning/replenishment/[branchId]/_components/replenishment-workbench";
import { Button } from "@/components/ui/button";
import {
  getReplenishmentAccessAction,
  getReplenishmentWorkbenchAction,
  listReplenishmentPeriodsAction,
} from "@/features/demand-planning/actions/demand-planning-workbench.actions";
import { canViewDemandPlanning } from "@/features/demand-planning/lib/permissions";
import { requireAuth } from "@/lib/auth/permissions";

interface ReplenishmentWorkbenchPageProps {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<{ period?: string }>;
}

export default async function ReplenishmentWorkbenchPage({
  params,
  searchParams,
}: ReplenishmentWorkbenchPageProps) {
  const session = await requireAuth();
  if (!canViewDemandPlanning(session.user.permissions)) {
    redirect("/dashboard?error=forbidden");
  }

  const { branchId } = await params;
  const { period } = await searchParams;
  const [access, periods, result] = await Promise.all([
    getReplenishmentAccessAction(),
    listReplenishmentPeriodsAction(),
    getReplenishmentWorkbenchAction(branchId, period),
  ]);

  if ("error" in result && result.error) {
    notFound();
  }
  if (!("snapshot" in result) || !result.snapshot) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${result.snapshot.sapCode} ${result.snapshot.name}`}
        description="Live replenishment grid. Frequency, quota, display units, and forecast recompute Drop 1 here; Send creates a supplementary auto-replenish without changing the released plan."
        actions={
          <Button variant="outline" asChild>
            <Link
              href={`/planning/replenishment${
                result.snapshot.periodId ? `?period=${result.snapshot.periodId}` : ""
              }`}
            >
              All branches
            </Link>
          </Button>
        }
      />
      <ReplenishmentWorkbench
        key={`${result.snapshot.branchId}-${result.snapshot.periodId}`}
        snapshot={result.snapshot}
        periods={periods}
        canManage={access.canManage}
        canSend={access.canSend}
      />
    </div>
  );
}
