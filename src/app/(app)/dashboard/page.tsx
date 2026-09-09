import { redirect } from "next/navigation";

import { getModuleNavPermission } from "@/config/app-modules";
import {
  requireAuth,
  requirePermission,
  resolveSessionPlatformOperator,
} from "@/lib/auth/permissions";
import { pageMetadata } from "@/lib/shared/seo";
import { listUsersAction } from "@/features/users/actions/user.actions";
import { DASHBOARD_PAGE_TUTORIAL } from "@/content/page-tutorials/dashboard";
import { PageHeader } from "@/app/(app)/_components/page-header";
import {
  getDashboardAnalyticsAction,
  getDashboardKpisAction,
  getDashboardSalesAnalyticsAction,
} from "@/features/dashboard/actions/dashboard-kpi.actions";
import { buildDashboardViewModel } from "@/features/dashboard/lib/build-dashboard-view-model";
import { listActiveAnnouncementsAction } from "@/features/announcements/actions/announcement.actions";
import { getCachedDashboardBriefingAction } from "@/features/ai/actions/ai.actions";
import { DashboardBriefingStrip } from "@/features/ai/components/dashboard-briefing-strip";
import { canUseAiAssist } from "@/features/ai/constants/ai-permissions";
import { isAiConfigured } from "@/features/ai/lib/provider";
import { ActiveAnnouncementBanner } from "@/features/announcements/components/active-announcement-banner";
import { DashboardOpsKpis } from "@/app/(app)/dashboard/_components/dashboard-ops-kpis";
import { DashboardAnalyticsCharts } from "@/app/(app)/dashboard/_components/dashboard-analytics-charts";
import { DashboardSalesSection } from "@/app/(app)/dashboard/_components/dashboard-sales-section";
import { DashboardComplianceCards } from "@/app/(app)/dashboard/_components/dashboard-compliance-cards";
import { DashboardRecentUsers } from "@/app/(app)/dashboard/_components/dashboard-recent-users";

export const metadata = pageMetadata("Dashboard");

export default async function DashboardPage() {
  const dashboardPermission = getModuleNavPermission("dashboard");
  const session = dashboardPermission
    ? await requirePermission(dashboardPermission)
    : await requireAuth();

  if (await resolveSessionPlatformOperator(session.user)) {
    redirect("/provider");
  }

  const permissions = session.user.permissions ?? [];
  const roleSlugs = session.user.roleSlugs ?? [];

  const canAssist = canUseAiAssist(permissions);

  const [opsKpis, analytics, salesAnalytics, activeAnnouncements, briefingResult] =
    await Promise.all([
      getDashboardKpisAction(),
      getDashboardAnalyticsAction(),
      getDashboardSalesAnalyticsAction(),
      listActiveAnnouncementsAction(),
      canAssist
        ? getCachedDashboardBriefingAction()
        : Promise.resolve({ ok: false as const, briefing: null, configured: false }),
    ]);

  const view = buildDashboardViewModel({
    permissions,
    roleSlugs,
    kpis: opsKpis,
    analytics,
    salesAnalytics,
  });

  const users = view.showRecentUsers
    ? (await listUsersAction()).slice(0, 5)
    : [];

  const displayName = session.user.name ?? session.user.email;
  const showOpsSplit = view.hasOps && Boolean(analytics) && view.showCharts;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        tutorial={DASHBOARD_PAGE_TUTORIAL}
        description={`Welcome back, ${displayName} · ${view.personaLabel}`}
      />
      <ActiveAnnouncementBanner announcements={activeAnnouncements} />

      {canAssist ? (
        <DashboardBriefingStrip
          canAssist={canAssist}
          configured={isAiConfigured()}
          initial={briefingResult.ok ? briefingResult.briefing : null}
        />
      ) : null}

      {opsKpis && view.kpiKeys.length > 0 ? (
        <DashboardOpsKpis kpis={opsKpis} visibleKeys={view.kpiKeys} />
      ) : null}

      {showOpsSplit && analytics ? (
        <DashboardAnalyticsCharts
          analytics={analytics}
          kpis={opsKpis}
          opsAlertKeys={view.opsAlertKeys}
          showStockChart={view.showStockChart}
          showOrderChart={view.showOrderChart}
          showOpsAlerts={view.showOpsAlerts}
          showPeriodSnapshot={view.showPeriodSnapshot}
          showOrdersThisMonth={view.caps.showOrdersThisMonth}
          showSalesThisMonth={view.caps.showSalesThisMonth}
          showDeliveryInTransit={view.caps.showDeliveryInTransit}
        />
      ) : null}

      {view.showSalesSection && salesAnalytics ? (
        <DashboardSalesSection analytics={salesAnalytics} />
      ) : null}

      {view.complianceCards.length > 0 ? (
        <DashboardComplianceCards cards={view.complianceCards} />
      ) : null}

      {view.showRecentUsers ? <DashboardRecentUsers users={users} /> : null}
    </div>
  );
}
