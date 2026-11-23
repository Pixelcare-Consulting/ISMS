import {
  getCompetitorKpisAction,
  listCompetitorFormOptionsAction,
  listCompetitorObservationsAction,
} from "@/features/competitors/actions/competitor.actions";
import { CompetitorKpisStrip } from "@/features/competitors/components/competitor-kpis";
import { CompetitorsTable } from "@/features/competitors/components/competitors-table";
import { PageHeader } from "@/app/(app)/_components/page-header";
import {
  hasPermission,
  requireTenantSetupAdminOrAnyPermission,
} from "@/lib/auth/permissions";

export default async function CompetitorsPage() {
  const session = await requireTenantSetupAdminOrAnyPermission(["competitors.view"]);
  const canManage = hasPermission(session.user.permissions, "competitors.manage");

  const [observations, kpis, options] = await Promise.all([
    listCompetitorObservationsAction(),
    getCompetitorKpisAction(),
    listCompetitorFormOptionsAction(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Competitors"
        description="Manual market price observations by competitor and product. Choose a branch from your AOR."
      />
      <CompetitorKpisStrip kpis={kpis} />
      <CompetitorsTable
        observations={observations}
        canManage={canManage}
        competitors={options.competitors}
        branches={options.branches}
        aorBranches={options.aorBranches}
        brands={options.brands}
        models={options.models}
      />
    </div>
  );
}
