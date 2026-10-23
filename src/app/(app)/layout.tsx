import { cookies, headers } from "next/headers";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { requireAuth, resolveSessionPlatformOperator } from "@/lib/auth/permissions";
import {
  getCachedLayoutBranding,
  getCachedLayoutProfile,
} from "@/lib/auth/layout-data";
import { AppNavigationProgress } from "@/app/(app)/_components/app-navigation-progress";
import { AppSidebar } from "@/app/(app)/_components/app-sidebar";
import { AppTopLoader } from "@/app/(app)/_components/app-top-loader";
import { PixelcareAwareShell } from "@/app/(app)/_components/pixelcare-aware-shell";
import { WhatsNewHeaderAction } from "@/app/(app)/_components/whats-new-header-action";
import { DocumentTitle } from "@/components/document-title";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { resolveRouteTitle } from "@/config/route-titles";
import { AiCopilotLauncher } from "@/features/ai/components/ai-copilot-launcher";
import { canUseAiAssist } from "@/features/ai/constants/ai-permissions";
import { isAiConfigured } from "@/features/ai/lib/provider";
import { readAiAssistantGate } from "@/features/ai/services/assistant-policy.service";
import { countUnreadAnnouncementsAction } from "@/features/announcements/actions/announcement.actions";
import { countStockUnitsStkAction } from "@/features/inventory/actions/inventory.actions";
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
          getWorkflowNavCountBadgesAction(),
        ]),
  ]);

  const countBadges = operationalBadges
    ? {
        unreadAnnouncements: operationalBadges[0],
        stockUnitsStk: operationalBadges[1],
        ...operationalBadges[2],
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

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <DocumentTitle />
      <AppTopLoader />
      <Suspense fallback={null}>
        <AppNavigationProgress />
      </Suspense>

      <PixelcareAiFullscreenProvider>
        <PixelcareAwareShell
          sidebar={
            <AppSidebar
              branding={branding}
              user={user}
              useSetupNavigation={setupAdmin}
              countBadges={countBadges}
            />
          }
          header={
            <header className="app-header flex h-14 shrink-0 items-center gap-2 bg-white pl-2 pr-3 text-sidebar-foreground sm:pr-4 lg:pr-6">
              <SidebarTrigger className="text-sidebar hover:bg-sidebar-accent/60 hover:text-sidebar-foreground" />
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
      </PixelcareAiFullscreenProvider>

      <SapSyncProgressModals />
      <SapSyncReportDialogs />
      <AiCopilotLauncher
        canAssist={canUseAiAssist(session.user.permissions)}
        configured={isAiConfigured() && assistantGate.ok}
        canUsePixelcareAi={canUsePixelcareAi({
          userId: session.user.id,
          email: session.user.email,
          permissions: session.user.permissions,
        })}
      />
    </SidebarProvider>
  );
}
