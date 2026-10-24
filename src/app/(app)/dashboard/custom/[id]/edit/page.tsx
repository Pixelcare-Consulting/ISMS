import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/app/(app)/_components/page-header";
import { Button } from "@/components/ui/button";
import { CustomDashboardDesigner } from "@/features/custom-dashboards/components/custom-dashboard-designer";
import { CUSTOM_DASHBOARD_MANAGE } from "@/features/custom-dashboards/constants/custom-dashboard-permissions";
import { customDashboardService } from "@/features/custom-dashboards/services/custom-dashboard.service";
import { listAccessibleDatasetKeys } from "@/features/reporting/services/dataset-registry";
import { requirePermission } from "@/lib/auth/permissions";
import { pageMetadata } from "@/lib/shared/seo";

export const metadata = pageMetadata("Design Dashboard");

export default async function CustomDashboardEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePermission(CUSTOM_DASHBOARD_MANAGE);
  const dashboard = await customDashboardService.findReadable(session.user.tenantId, session.user.id, id);
  if (!dashboard?.isOwner) notFound();

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Design: ${dashboard.name}`}
        description="Drag ISMS dataset fields onto elements, then Save. The preview uses the default period."
        actions={
          <Button asChild variant="outline">
            <Link href={`/dashboard/custom/${dashboard.id}`}>View dashboard</Link>
          </Button>
        }
      />
      <CustomDashboardDesigner
        key={dashboard.id}
        id={dashboard.id}
        template={dashboard.template}
        defaultPeriod={dashboard.defaultPeriod}
        datasetKeys={listAccessibleDatasetKeys(session.user.permissions ?? [])}
      />
    </div>
  );
}
