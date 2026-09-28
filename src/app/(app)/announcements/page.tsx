import {
  listAnnouncementsAction,
} from "@/features/announcements/actions/announcement.actions";
import { AnnouncementsPanel } from "@/features/announcements/components/announcements-panel";
import { PageHeader } from "@/app/(app)/_components/page-header";
import {
  hasPermission,
  requireAnyPermission,
} from "@/lib/auth/permissions";

export default async function AnnouncementsPage() {
  const session = await requireAnyPermission([
    "announcements.view",
    "announcements.manage",
  ]);
  const canManage = hasPermission(session.user.permissions, "announcements.manage");
  const announcements = await listAnnouncementsAction();

  return (
    <div className="space-y-6 rounded-none bg-slate-50 dark:bg-muted">
      <PageHeader
        title="Announcements"
        description="Tenant posts shown on Dashboard → Overview. Active announcements appear in the feed for your team."
      />
      <AnnouncementsPanel
        canManage={canManage}
        announcements={announcements.map((row) => ({
          id: row.id,
          title: row.title,
          body: row.body,
          publishedAt: row.publishedAt.toISOString(),
          expiresAt: row.expiresAt?.toISOString() ?? null,
          isActive: row.isActive,
          createdAt: row.createdAt.toISOString(),
          createdBy: row.createdBy,
        }))}
      />
    </div>
  );
}
