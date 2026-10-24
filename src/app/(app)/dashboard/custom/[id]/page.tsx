import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/app/(app)/_components/page-header";
import { Button } from "@/components/ui/button";
import { CustomDashboardViewer } from "@/features/custom-dashboards/components/custom-dashboard-viewer";
import {
  CUSTOM_DASHBOARD_ACCESS,
  canManageCustomDashboards,
} from "@/features/custom-dashboards/constants/custom-dashboard-permissions";
import { customDashboardService } from "@/features/custom-dashboards/services/custom-dashboard.service";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { pageMetadata } from "@/lib/shared/seo";

export const metadata = pageMetadata("Custom Dashboard");

export default async function CustomDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireAnyPermission(CUSTOM_DASHBOARD_ACCESS);
  const dashboard = await customDashboardService.findReadable(session.user.tenantId, session.user.id, id);
  if (!dashboard) notFound();

  const canDesign = dashboard.isOwner && canManageCustomDashboards(session.user.permissions);

  return (
    <div className="space-y-4">
      <PageHeader
        title={dashboard.name}
        description={dashboard.description ?? `By ${dashboard.isOwner ? "you" : dashboard.ownerName}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/dashboard/custom">All dashboards</Link>
            </Button>
            {canDesign ? (
              <Button asChild>
                <Link href={`/dashboard/custom/${dashboard.id}/edit`}>Design</Link>
              </Button>
            ) : null}
          </div>
        }
      />
      <CustomDashboardViewer template={dashboard.template} defaultPeriod={dashboard.defaultPeriod} />
    </div>
  );
}
