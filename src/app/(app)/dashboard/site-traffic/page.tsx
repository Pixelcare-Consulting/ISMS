import { getSiteTrafficOverviewAction } from "@/features/dashboard/actions/site-traffic.actions";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { SiteTrafficPanel } from "@/app/(app)/dashboard/site-traffic/_components/site-traffic-panel";
import { SITE_TRAFFIC_PAGE_TUTORIAL } from "@/content/page-tutorials/site-traffic";
import { pageMetadata } from "@/lib/shared/seo";

export const metadata = pageMetadata("Site Traffic");

export default async function SiteTrafficPage() {
  await requireAnyPermission(["users.manage", "audit_logs.view"]);
  const overview = await getSiteTrafficOverviewAction();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Site Traffic"
        tutorial={SITE_TRAFFIC_PAGE_TUTORIAL}
        description="Who is online, recent activity, and top PS sales this month"
      />
      <SiteTrafficPanel overview={overview} />
    </div>
  );
}
