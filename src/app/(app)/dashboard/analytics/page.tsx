import { redirect } from "next/navigation";

import { PageHeader } from "@/app/(app)/_components/page-header";
import { getModuleNavPermission } from "@/config/app-modules";
import { DASHBOARD_ANALYTICS_PAGE_TUTORIAL } from "@/content/page-tutorials/dashboard-analytics";
import { resolveDashboardCapabilities } from "@/features/dashboard/constants/dashboard-permissions";
import { AnalyticsDashboard } from "@/features/reporting/components/analytics-dashboard";
import { ANALYTICS_SECTIONS } from "@/features/reporting/dashboards/analytics-layout";
import { canAccessDataset } from "@/features/reporting/services/dataset-registry";
import {
  requireAuth,
  requirePermission,
  resolveSessionPlatformOperator,
} from "@/lib/auth/permissions";
import { pageMetadata } from "@/lib/shared/seo";

export const metadata = pageMetadata("Analytics");

export default async function DashboardAnalyticsPage() {
  const dashboardPermission = getModuleNavPermission("dashboard");
  const session = dashboardPermission
    ? await requirePermission(dashboardPermission)
    : await requireAuth();

  if (await resolveSessionPlatformOperator(session.user)) {
    redirect("/provider");
  }

  // Same widget rules as the Recharts dashboards, plus the dataset's own gate.
  const permissions = session.user.permissions ?? [];
  const caps = resolveDashboardCapabilities(permissions);
  const visibleElements = ANALYTICS_SECTIONS.flatMap((section) => section.elements)
    .filter((element) => caps[element.capability] && canAccessDataset(element.datasetKey, permissions))
    .map((element) => element.name);

  if (visibleElements.length === 0) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Analytics"
        tutorial={DASHBOARD_ANALYTICS_PAGE_TUTORIAL}
        description="Operations and sales numbers for your assigned branches"
      />
      <AnalyticsDashboard visibleElements={visibleElements} />
    </div>
  );
}
