import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/app/(app)/_components/page-header";
import { Button } from "@/components/ui/button";
import { CopyReadyMadeButton } from "@/features/custom-dashboards/components/copy-ready-made-button";
import { CustomDashboardViewer } from "@/features/custom-dashboards/components/custom-dashboard-viewer";
import {
  CUSTOM_DASHBOARD_ACCESS,
  canManageCustomDashboards,
} from "@/features/custom-dashboards/constants/custom-dashboard-permissions";
import { READY_MADE_DASHBOARDS, isReadyMadeKey } from "@/features/custom-dashboards/ready-made/ready-made-dashboards";
import { READY_MADE_TEMPLATES } from "@/features/reporting/templates/template-loaders";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { pageMetadata } from "@/lib/shared/seo";

export const metadata = pageMetadata("Ready-made Dashboard");

export default async function ReadyMadeDashboardPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const session = await requireAnyPermission(CUSTOM_DASHBOARD_ACCESS);
  if (!isReadyMadeKey(key)) notFound();

  const dashboard = READY_MADE_DASHBOARDS[key];
  const template = (await READY_MADE_TEMPLATES[key]()).default as Record<string, unknown>;

  return (
    <div className="space-y-4">
      <PageHeader
        title={dashboard.name}
        description={dashboard.description}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/dashboard/custom">All dashboards</Link>
            </Button>
            {canManageCustomDashboards(session.user.permissions) ? <CopyReadyMadeButton readyMadeKey={key} /> : null}
          </div>
        }
      />
      <CustomDashboardViewer template={template} />
    </div>
  );
}
