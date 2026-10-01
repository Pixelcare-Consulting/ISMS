import { redirect } from "next/navigation";

import { getModuleNavPermission } from "@/config/app-modules";
import {
  requireAuth,
  requirePermission,
  resolveSessionPlatformOperator,
} from "@/lib/auth/permissions";
import { pageMetadata } from "@/lib/shared/seo";
import { DASHBOARD_SALES_PAGE_TUTORIAL } from "@/content/page-tutorials/dashboard-sales";
import { PageHeader } from "@/app/(app)/_components/page-header";
import {
  getDashboardAnalyticsAction,
  getDashboardKpisAction,
  getDashboardSalesAnalyticsAction,
} from "@/features/dashboard/actions/dashboard-kpi.actions";
import { buildDashboardViewModel } from "@/features/dashboard/lib/build-dashboard-view-model";
import { canAccessSalesDashboard } from "@/features/dashboard/constants/dashboard-permissions";
import { getCachedDashboardBriefingAction } from "@/features/ai/actions/ai.actions";
import { DashboardBriefingStrip } from "@/features/ai/components/dashboard-briefing-strip";
import { canUseAiAssist } from "@/features/ai/constants/ai-permissions";
import { isAiConfigured } from "@/features/ai/lib/provider";
import { DashboardSalesSection } from "@/app/(app)/dashboard/_components/dashboard-sales-section";

export const metadata = pageMetadata("Sales");

export default async function DashboardSalesPage() {
  const dashboardPermission = getModuleNavPermission("dashboard");
  const session = dashboardPermission
    ? await requirePermission(dashboardPermission)
    : await requireAuth();

  if (await resolveSessionPlatformOperator(session.user)) {
    redirect("/provider");
  }

  const permissions = session.user.permissions ?? [];
  if (!canAccessSalesDashboard(permissions)) {
    redirect("/dashboard");
  }

  const roleSlugs = session.user.roleSlugs ?? [];
  const canAssist = canUseAiAssist(permissions);

  const [opsKpis, analytics, salesAnalytics, briefingResult] = await Promise.all([
    getDashboardKpisAction(),
    getDashboardAnalyticsAction(),
    getDashboardSalesAnalyticsAction(),
    canAssist
      ? getCachedDashboardBriefingAction("sales")
      : Promise.resolve({
          ok: false as const,
          briefing: null,
          configured: false,
        }),
  ]);

  const view = buildDashboardViewModel({
    permissions,
    roleSlugs,
    kpis: opsKpis,
    analytics,
    salesAnalytics,
  });

  const displayName = session.user.name ?? session.user.email;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sales"
        tutorial={DASHBOARD_SALES_PAGE_TUTORIAL}
        description={`Welcome back, ${displayName} · ${view.personaLabel}`}
      />

      {canAssist ? (
        <DashboardBriefingStrip
          canAssist={canAssist}
          configured={isAiConfigured()}
          initial={briefingResult.ok ? briefingResult.briefing : null}
          surface="sales"
        />
      ) : null}

      {view.showSalesSection && salesAnalytics ? (
        <DashboardSalesSection analytics={salesAnalytics} />
      ) : (
        <div className="rounded-lg border border-dashed border-border/70 bg-card px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No sales overview is available for your role yet. Open Sales
            Transactions or Returns / Replacement from the menu to continue.
          </p>
        </div>
      )}
    </div>
  );
}
