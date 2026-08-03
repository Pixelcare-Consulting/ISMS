import { getModuleNavPermission } from "@/config/app-modules";
import { requireAuth, requirePermission } from "@/lib/auth/permissions";
import { pageMetadata } from "@/lib/shared/seo";
import { listUsersAction } from "@/features/users/actions/user.actions";
import { DASHBOARD_PAGE_TUTORIAL } from "@/content/page-tutorials/dashboard";
import { PageHeader } from "@/app/(app)/_components/page-header";
import {
  getDashboardAnalyticsAction,
  getDashboardKpisAction,
} from "@/features/dashboard/actions/dashboard-kpi.actions";
import { buildDashboardViewModel } from "@/features/dashboard/lib/build-dashboard-view-model";
import { listActiveAnnouncementsAction } from "@/features/announcements/actions/announcement.actions";
import { ActiveAnnouncementBanner } from "@/features/announcements/components/active-announcement-banner";
import { DashboardOpsKpis } from "@/app/(app)/dashboard/_components/dashboard-ops-kpis";
import { DashboardAnalyticsCharts } from "@/app/(app)/dashboard/_components/dashboard-analytics-charts";
import { DashboardComplianceCards } from "@/app/(app)/dashboard/_components/dashboard-compliance-cards";
import { DashboardRecentUsers } from "@/app/(app)/dashboard/_components/dashboard-recent-users";

export const metadata = pageMetadata("Dashboard");

export default async function DashboardPage() {
  const dashboardPermission = getModuleNavPermission("dashboard");
  const session = dashboardPermission
    ? await requirePermission(dashboardPermission)
    : await requireAuth();
  const permissions = session.user.permissions ?? [];
  const roleSlugs = session.user.roleSlugs ?? [];

  const [opsKpis, analytics, activeAnnouncements] = await Promise.all([
    getDashboardKpisAction(),
    getDashboardAnalyticsAction(),
    listActiveAnnouncementsAction(),
  ]);

  const view = buildDashboardViewModel({
    permissions,
    roleSlugs,
    kpis: opsKpis,
    analytics,
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

      {view.complianceCards.length > 0 ? (
        <DashboardComplianceCards cards={view.complianceCards} />
      ) : null}

      {view.showRecentUsers ? <DashboardRecentUsers users={users} /> : null}
    </div>
  );
}
