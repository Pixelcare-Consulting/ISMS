import { redirect } from "next/navigation";

import { getModuleNavPermission } from "@/config/app-modules";
import {
  hasPermission,
  requireAuth,
  requirePermission,
  resolveSessionPlatformOperator,
} from "@/lib/auth/permissions";
import { pageMetadata } from "@/lib/shared/seo";
import { DASHBOARD_PAGE_TUTORIAL } from "@/content/page-tutorials/dashboard";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { listAnnouncementFeedAction } from "@/features/announcements/actions/announcement.actions";
import { OverviewAnnouncementFeed } from "@/app/(app)/dashboard/_components/overview-announcement-feed";

export const metadata = pageMetadata("Overview");

export default async function DashboardPage() {
  const dashboardPermission = getModuleNavPermission("dashboard");
  const session = dashboardPermission
    ? await requirePermission(dashboardPermission)
    : await requireAuth();

  if (await resolveSessionPlatformOperator(session.user)) {
    redirect("/provider");
  }

  const feed = await listAnnouncementFeedAction();
  const displayName = session.user.name ?? session.user.email;
  const unreadCount = feed.filter((item) => !item.readByMe).length;

  return (
    <div className="space-y-5 rounded-none bg-slate-50 dark:bg-muted">
      <PageHeader
        title="Overview"
        tutorial={DASHBOARD_PAGE_TUTORIAL}
        description={
          unreadCount > 0
            ? `Welcome back, ${displayName} · ${unreadCount} new announcement${unreadCount === 1 ? "" : "s"}`
            : `Welcome back, ${displayName} · Company announcements`
        }
      />

      <OverviewAnnouncementFeed
        items={feed}
        currentUser={{
          id: session.user.id,
          name: session.user.name ?? null,
          email: session.user.email ?? "",
          image: session.user.image ?? null,
        }}
        canManageAnnouncements={hasPermission(
          session.user.permissions,
          "announcements.manage",
        )}
      />
    </div>
  );
}
