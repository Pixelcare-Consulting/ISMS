import { redirect } from "next/navigation";

import { PageHeader } from "@/app/(app)/_components/page-header";
import { ReplenishmentMatrix } from "@/app/(app)/planning/replenishment/_components/replenishment-matrix";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import {
  getReplenishmentAccessAction,
  listReplenishmentMatrixAction,
} from "@/features/demand-planning/actions/demand-planning-workbench.actions";
import { canViewDemandPlanning } from "@/features/demand-planning/lib/permissions";
import { requireAuth } from "@/lib/auth/permissions";

interface ReplenishmentMatrixPageProps {
  searchParams: Promise<{
    period?: string;
    q?: string;
    page?: string;
    limit?: string;
  }>;
}

export default async function ReplenishmentMatrixPage({
  searchParams,
}: ReplenishmentMatrixPageProps) {
  const session = await requireAuth();
  if (!canViewDemandPlanning(session.user.permissions)) {
    redirect("/dashboard?error=forbidden");
  }

  const params = await searchParams;
  const page = Number(params.page) || 1;
  const limit = parseTablePageSize(params.limit);
  const [access, result] = await Promise.all([
    getReplenishmentAccessAction(),
    listReplenishmentMatrixAction({
      periodId: params.period,
      q: params.q,
      page,
      limit,
    }),
  ]);

  if (!("view" in result) || !result.view) {
    return (
      <div className="space-y-6">
        <PageHeader title="Replenishment" description="Could not load the branch matrix." />
        <p className="text-sm text-muted-foreground">
          {"error" in result ? result.error : "Try another period."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Replenishment"
        description="All-branch planogram and period targets. Open a branch to edit Drop 1 live and send a supplementary auto-replenish."
      />
      <ReplenishmentMatrix
        view={result.view}
        query={params.q ?? ""}
        canManage={access.canManage}
      />
    </div>
  );
}
