import {
  getPcountDashboardOverviewAction,
  hasPcountDashboardBranchAccessAction,
} from "@/features/stock-audit/actions/pcount-dashboard.actions";
import { resolvePcountPeriod } from "@/features/stock-audit/services/pcount-dashboard.service";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { PcountDashboardPanel } from "@/app/(app)/dashboard/pcount/_components/pcount-dashboard-panel";
import { PCOUNT_DASHBOARD_PAGE_TUTORIAL } from "@/content/page-tutorials/pcount-dashboard";
import { pageMetadata } from "@/lib/shared/seo";

export const metadata = pageMetadata("P-Count Dashboard");

interface PcountDashboardPageProps {
  searchParams: Promise<{
    period?: string;
    dealerId?: string;
  }>;
}

export default async function PcountDashboardPage({
  searchParams,
}: PcountDashboardPageProps) {
  await requireAnyPermission(["inventory.view", "reports.view"]);
  const params = await searchParams;
  const resolved = resolvePcountPeriod(params.period);
  const period = `${resolved.year}-${String(resolved.month).padStart(2, "0")}`;

  const [overview, hasBranchAccess] = await Promise.all([
    getPcountDashboardOverviewAction({
      period,
      dealerId: params.dealerId,
    }),
    hasPcountDashboardBranchAccessAction(),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="P-Count Dashboard"
        tutorial={PCOUNT_DASHBOARD_PAGE_TUTORIAL}
        description={`Physical count progress · ${overview.period.label} (Manila)`}
      />
      <PcountDashboardPanel
        overview={overview}
        currentPeriod={period}
        currentDealerId={params.dealerId}
        hasBranchAccess={hasBranchAccess}
      />
    </div>
  );
}
