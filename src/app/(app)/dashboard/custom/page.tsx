import Link from "next/link";

import { PageHeader } from "@/app/(app)/_components/page-header";
import { DASHBOARD_CUSTOM_PAGE_TUTORIAL } from "@/content/page-tutorials/dashboard-custom";
import { CustomDashboardRowActions } from "@/features/custom-dashboards/components/custom-dashboard-row-actions";
import { NewCustomDashboardButton } from "@/features/custom-dashboards/components/new-custom-dashboard-button";
import {
  CUSTOM_DASHBOARD_ACCESS,
  canManageCustomDashboards,
} from "@/features/custom-dashboards/constants/custom-dashboard-permissions";
import { READY_MADE_DASHBOARDS, READY_MADE_KEYS } from "@/features/custom-dashboards/ready-made/ready-made-dashboards";
import { CUSTOM_DASHBOARD_VISIBILITY_LABELS } from "@/features/custom-dashboards/schemas/custom-dashboard.schema";
import { customDashboardService } from "@/features/custom-dashboards/services/custom-dashboard.service";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { pageMetadata } from "@/lib/shared/seo";

export const metadata = pageMetadata("Custom Dashboards");

const updatedFormatter = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" });

export default async function CustomDashboardsPage() {
  const session = await requireAnyPermission(CUSTOM_DASHBOARD_ACCESS);
  const canManage = canManageCustomDashboards(session.user.permissions);
  const dashboards = await customDashboardService.list(session.user.tenantId, session.user.id);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Custom Dashboards"
        tutorial={DASHBOARD_CUSTOM_PAGE_TUTORIAL}
        description="Ready-made dashboards, your own, and ones shared with your company"
        actions={canManage ? <NewCustomDashboardButton /> : undefined}
      />

      <section aria-labelledby="ready-made-heading" className="space-y-3">
        <h2 id="ready-made-heading" className="text-base font-semibold">
          Ready-made
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {READY_MADE_KEYS.map((key) => (
            <li key={key}>
              <Link
                href={`/dashboard/custom/ready/${key}`}
                className="flex h-full flex-col gap-1 rounded-xl border bg-card p-4 transition-colors hover:border-primary focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="font-medium">{READY_MADE_DASHBOARDS[key].name}</span>
                <span className="text-sm text-muted-foreground">{READY_MADE_DASHBOARDS[key].description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="my-dashboards-heading" className="space-y-3">
        <h2 id="my-dashboards-heading" className="text-base font-semibold">
          My and shared dashboards
        </h2>
        {dashboards.length === 0 ? (
          <div className="rounded-xl border bg-card p-8 text-center">
            <p className="font-medium">No custom dashboards yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {canManage
                ? "Start from a ready-made dashboard above, or create one from scratch."
                : "Dashboards your colleagues share with the company will show up here."}
            </p>
          </div>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {dashboards.map((dashboard) => (
              <li key={dashboard.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <Link
                    href={`/dashboard/custom/${dashboard.id}`}
                    className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline"
                  >
                    {dashboard.name}
                  </Link>
                  {dashboard.description ? (
                    <p className="line-clamp-2 text-sm text-muted-foreground">{dashboard.description}</p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {CUSTOM_DASHBOARD_VISIBILITY_LABELS[dashboard.visibility]} · {dashboard.isOwner ? "You" : dashboard.ownerName} ·
                    Updated {updatedFormatter.format(new Date(dashboard.updatedAt))}
                  </p>
                </div>
                {dashboard.isOwner && canManage ? <CustomDashboardRowActions dashboard={dashboard} /> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
