import { cookies, headers } from "next/headers";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { requireAuth, resolveSessionPlatformOperator } from "@/lib/auth/permissions";
import {
  getCachedLayoutBranding,
  getCachedLayoutProfile,
} from "@/lib/auth/layout-data";
import { AppNavProvider } from "@/app/(app)/_components/app-nav-provider";
import { AppNavigationProgress } from "@/app/(app)/_components/app-navigation-progress";
import { AppSidebar } from "@/app/(app)/_components/app-sidebar";
import { AppTopLoader } from "@/app/(app)/_components/app-top-loader";
import {
  ContextualSidebar,
  ContextualSidebarTrigger,
} from "@/app/(app)/_components/contextual-sidebar";
import {
  CONTEXTUAL_SIDEBAR_COOKIE,
  parseContextualSidebarPreference,
} from "@/app/(app)/_components/contextual-sidebar-preference";
import { PixelcareAwareShell } from "@/app/(app)/_components/pixelcare-aware-shell";
import { WhatsNewHeaderAction } from "@/app/(app)/_components/whats-new-header-action";
import { SessionActivity } from "@/components/auth/session-activity";
import { recordSiteVisitSafe } from "@/features/dashboard/services/site-traffic-visit.service";
import { DocumentTitle } from "@/components/document-title";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { resolveRouteTitle } from "@/config/route-titles";
import { AiCopilotLauncher } from "@/features/ai/components/ai-copilot-launcher";
import { canUseAiAssist } from "@/features/ai/constants/ai-permissions";
import { CUSTOM_DASHBOARD_ACCESS } from "@/features/custom-dashboards/constants/custom-dashboard-permissions";
import { customDashboardService } from "@/features/custom-dashboards/services/custom-dashboard.service";
import { isAiConfigured } from "@/features/ai/lib/provider";
import { readAiAssistantGate } from "@/features/ai/services/assistant-policy.service";
import { countUnreadAnnouncementsAction } from "@/features/announcements/actions/announcement.actions";
import {
  countBranchInventoryV2UpdatesAction,
  countStockUnitsStkAction,
} from "@/features/inventory/actions/inventory.actions";
import { getWorkflowNavCountBadgesAction } from "@/features/nav-badges/actions/nav-count-badges.actions";
import { countUnreadNotificationsAction } from "@/features/notifications/actions/notification.actions";
import { NotificationsHeaderAction } from "@/features/notifications/components/notifications-header-action";
import { PixelcareAiFullscreenProvider } from "@/features/pixelcare-ai/components/fullscreen-provider";
import { canUsePixelcareAi } from "@/features/pixelcare-ai/constants/permissions";
import {
  SETUP_HOME,
  isSetupPathAllowed,
  isTenantSetupAdmin,
} from "@/features/roles/constants/setup-access";
import { SapSyncProgressModals } from "@/features/sap/components/sap-sync-progress-modal";
import { SapSyncReportDialogs } from "@/features/sap/components/sap-sync-report-dialogs";
import { logger } from "@/lib/shared/logger";
import { pageMetadata } from "@/lib/shared/seo";

export async function generateMetadata(): Promise<Metadata> {
  const pathname = (await headers()).get("x-pathname") ?? "";
  const title = resolveRouteTitle(pathname);
  return title ? pageMetadata(title) : {};
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAuth();
  const isPlatformOperator = await resolveSessionPlatformOperator(session.user);
  const pathname = (await headers()).get("x-pathname") ?? "";
  const setupAdmin = isTenantSetupAdmin({
    roleSlugs: session.user.roleSlugs,
    isPlatformOperator,
  });

  if (setupAdmin && !isSetupPathAllowed(pathname)) {
    redirect(SETUP_HOME);
  }

  const [
    branding,
    profile,
    cookieStore,
    unreadNotificationCount,
    assistantGate,
    operationalBadges,
    customDashboards,
  ] = await Promise.all([
    getCachedLayoutBranding(session.user.tenantId),
    getCachedLayoutProfile(session.user.tenantId, session.user.id),
    cookies(),
    countUnreadNotificationsAction().catch(() => 0),
    readAiAssistantGate(session.user.tenantId),
    setupAdmin
      ? Promise.resolve(null)
      : Promise.all([
          countUnreadAnnouncementsAction().catch(() => 0),
          countStockUnitsStkAction().catch(() => 0),
          countBranchInventoryV2UpdatesAction().catch(() => 0),
          getWorkflowNavCountBadgesAction(),
        ]),
    CUSTOM_DASHBOARD_ACCESS.some((p) => session.user.permissions.includes(p))
      ? customDashboardService
          .listNavItems(session.user.tenantId, session.user.id)
          .catch((error: unknown) => {
            // The sidebar still renders; the list page stays reachable.
            logger.warn({ err: error, tenantId: session.user.tenantId }, "custom-dashboards: sidebar list failed");
            return [];
          })
      : Promise.resolve([]),
    recordSiteVisitSafe({
      sessionId: session.sessionId ?? "",
      tenantId: session.user.tenantId,
      path: pathname,
    }),
  ]);

  const countBadges = operationalBadges
    ? {
        unreadAnnouncements: operationalBadges[0],
        stockUnitsStk: operationalBadges[1],
        branchInventoryV2Updates: operationalBadges[2],
        ...operationalBadges[3],
      }
    : {};

  const user = {
    name: profile.name ?? session.user.name,
    email: session.user.email,
    image: profile.image,
    permissions: session.user.permissions,
    isPlatformOperator,
  };

  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";
  const secondaryPreference = parseContextualSidebarPreference(
    cookieStore.get(CONTEXTUAL_SIDEBAR_COOKIE)?.value,
  );

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <DocumentTitle />
      <SessionActivity />
      <AppTopLoader />
      <Suspense fallback={null}>
        <AppNavigationProgress />
      </Suspense>

      <PixelcareAiFullscreenProvider>
        <AppNavProvider
          useSetupNavigation={setupAdmin}
          permissions={user.permissions}
          isPlatformOperator={user.isPlatformOperator}
          countBadges={countBadges}
          customDashboards={customDashboards}
          secondaryPreference={secondaryPreference}
        >
          <PixelcareAwareShell
            sidebar={
              <AppSidebar branding={branding} user={user} />
            }
            contextual={<ContextualSidebar />}
            header={
              <header className="app-header flex h-14 shrink-0 items-center gap-2 bg-white pl-2 pr-3 text-sidebar-foreground sm:pr-4 lg:pr-6">
                <SidebarTrigger className="text-sidebar hover:bg-sidebar-accent/60 hover:text-sidebar-foreground" />
                <ContextualSidebarTrigger />
                <WhatsNewHeaderAction />
                <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
                  <NotificationsHeaderAction
                    initialUnreadCount={unreadNotificationCount}
                  />
                </div>
              </header>
            }
          >
            {children}
          </PixelcareAwareShell>
        </AppNavProvider>
      </PixelcareAiFullscreenProvider>

      <SapSyncProgressModals />
      <SapSyncReportDialogs />
      <AiCopilotLauncher
        canAssist={canUseAiAssist(session.user.permissions)}
        configured={isAiConfigured() && assistantGate.ok}
        assistantEnabled={assistantGate.ok}
        canUsePixelcareAi={canUsePixelcareAi({
          userId: session.user.id,
          email: session.user.email,
          permissions: session.user.permissions,
        })}
      />
    </SidebarProvider>
  );
}
