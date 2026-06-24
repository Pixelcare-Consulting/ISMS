import { Suspense } from "react";

import { requireAuth, resolveSessionPlatformOperator } from "@/lib/auth/permissions";
import {
  getCachedLayoutBranding,
  getCachedLayoutProfile,
} from "@/lib/auth/layout-data";
import { AppHeader } from "@/app/(app)/_components/app-header";
import { AppNavigationProgress } from "@/app/(app)/_components/app-navigation-progress";
import { AppTopLoader } from "@/app/(app)/_components/app-top-loader";
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAuth();
  const [branding, profile, isPlatformOperator] = await Promise.all([
    getCachedLayoutBranding(session.user.tenantId),
    getCachedLayoutProfile(session.user.tenantId, session.user.id),
    resolveSessionPlatformOperator(session.user),
  ]);

  const user = {
    name: profile.name ?? session.user.name,
    email: session.user.email,
    image: profile.image,
    permissions: session.user.permissions,
    isPlatformOperator,
  };

  return (
    <div className="app-shell flex h-dvh w-full flex-col overflow-hidden">
      <AppTopLoader />
      <Suspense fallback={null}>
        <AppNavigationProgress />
      </Suspense>
      <AppHeader branding={branding} user={user} />      
      <main className="content-scrollbar w-full flex-1 overflow-y-auto bg-background">
        <div className="w-full px-5 py-6 sm:px-7 lg:px-10">
          {children}
        </div>
      </main>
    </div>
  );
}
