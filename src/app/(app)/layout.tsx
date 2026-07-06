import { cookies } from "next/headers";
import { Suspense } from "react";

import { requireAuth, resolveSessionPlatformOperator } from "@/lib/auth/permissions";
import {
  getCachedLayoutBranding,
  getCachedLayoutProfile,
} from "@/lib/auth/layout-data";
import { AppNavigationProgress } from "@/app/(app)/_components/app-navigation-progress";
import { AppSidebar } from "@/app/(app)/_components/app-sidebar";
import { AppTopLoader } from "@/app/(app)/_components/app-top-loader";
import { WhatsNewHeaderAction } from "@/app/(app)/_components/whats-new-header-action";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAuth();
  const [branding, profile, isPlatformOperator, cookieStore] = await Promise.all([
    getCachedLayoutBranding(session.user.tenantId),
    getCachedLayoutProfile(session.user.tenantId, session.user.id),
    resolveSessionPlatformOperator(session.user),
    cookies(),
  ]);

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
      <AppTopLoader />
      <Suspense fallback={null}>
        <AppNavigationProgress />
      </Suspense>

      <AppSidebar branding={branding} user={user} />

      <SidebarInset className="h-svh overflow-hidden">
        <header className="app-header flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border bg-sidebar px-3 text-sidebar-foreground sm:px-4 lg:px-6">
          <SidebarTrigger className="text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground" />
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <WhatsNewHeaderAction />
          </div>
        </header>

        <div className="content-scrollbar flex-1 overflow-y-auto bg-background">
          <div className="w-full px-5 py-6 sm:px-7 lg:px-10">{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
