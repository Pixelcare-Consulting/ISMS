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
  // #region agent log
  fetch("http://127.0.0.1:7904/ingest/90072bc3-ed3d-4cdb-89b5-6031621ce6d7", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "f1e4c9",
    },
    body: JSON.stringify({
      sessionId: "f1e4c9",
      runId: "pre-fix",
      hypothesisId: "B",
      location: "dashboard/page.tsx:entry",
      message: "DashboardPage enter",
      data: {},
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  const dashboardPermission = getModuleNavPermission("dashboard");
  let session;
  try {
    session = dashboardPermission
      ? await requirePermission(dashboardPermission)
      : await requireAuth();
  } catch (err) {
    // #region agent log
    fetch("http://127.0.0.1:7904/ingest/90072bc3-ed3d-4cdb-89b5-6031621ce6d7", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "f1e4c9",
      },
      body: JSON.stringify({
        sessionId: "f1e4c9",
        runId: "pre-fix",
        hypothesisId: "B",
        location: "dashboard/page.tsx:auth",
        message: "Auth/permission failed",
        data: {
          name: err instanceof Error ? err.name : typeof err,
          message: err instanceof Error ? err.message : String(err),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    throw err;
  }

  if (await resolveSessionPlatformOperator(session.user)) {
    redirect("/provider");
  }

  let feed;
  try {
    feed = await listAnnouncementFeedAction();
    // #region agent log
    fetch("http://127.0.0.1:7904/ingest/90072bc3-ed3d-4cdb-89b5-6031621ce6d7", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "f1e4c9",
      },
      body: JSON.stringify({
        sessionId: "f1e4c9",
        runId: "pre-fix",
        hypothesisId: "A",
        location: "dashboard/page.tsx:feed-ok",
        message: "Feed loaded",
        data: { count: Array.isArray(feed) ? feed.length : -1 },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  } catch (err) {
    const prismaCode =
      err && typeof err === "object" && "code" in err
        ? String((err as { code: unknown }).code)
        : undefined;
    const meta =
      err && typeof err === "object" && "meta" in err
        ? (err as { meta: unknown }).meta
        : undefined;
    // #region agent log
    fetch("http://127.0.0.1:7904/ingest/90072bc3-ed3d-4cdb-89b5-6031621ce6d7", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "f1e4c9",
      },
      body: JSON.stringify({
        sessionId: "f1e4c9",
        runId: "pre-fix",
        hypothesisId: "A",
        location: "dashboard/page.tsx:feed-error",
        message: "Feed load failed",
        data: {
          name: err instanceof Error ? err.name : typeof err,
          message: err instanceof Error ? err.message : String(err),
          prismaCode,
          meta,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    console.error("[debug-f1e4c9] dashboard feed failed", {
      prismaCode,
      meta,
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

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
