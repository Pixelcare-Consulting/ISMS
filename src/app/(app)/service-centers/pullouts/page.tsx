import { redirect } from "next/navigation";

import { PageHeader } from "@/app/(app)/_components/page-header";
import { PulloutsPanel } from "@/app/(app)/logistics/_components/pullouts-panel";
import { ScPulloutSourceProvider } from "@/app/(app)/service-centers/pullouts/_components/sc-pullout-source";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { ModuleGuide } from "@/components/module-guide";
import { SC_OPS_MODULE_GUIDE } from "@/content/module-guides/service-center-ops";
import { SC_PULLOUTS_PAGE_TUTORIAL } from "@/content/page-tutorials/service-center-ops";
import { PulloutKpisStrip } from "@/features/logistics/components/pullout-kpis";
import { loadWorkflowCatalog } from "@/features/logistics/constants/workflow-catalog";
import {
  getScPulloutKpisAction,
  listScPulloutsAction,
} from "@/features/service-center-ops/actions/sc-pullouts.actions";
import {
  canAccessScLogistics,
  resolveScPulloutCapabilities,
} from "@/features/service-center-ops/constants/sc-permissions";
import { requireAuth } from "@/lib/auth/permissions";
import { pageMetadata } from "@/lib/shared/seo";

export const metadata = pageMetadata(
  "Service center pull-outs",
  "Request, approve, list, and send pull-outs from service center stock.",
);

interface PageProps {
  searchParams: Promise<{ page?: string; limit?: string; sort?: string; dir?: string }>;
}

export default async function ScPulloutsPage({ searchParams }: PageProps) {
  const session = await requireAuth();
  if (!canAccessScLogistics(session.user.permissions)) {
    redirect("/dashboard?error=forbidden");
  }

  const params = await searchParams;
  const [pullouts, kpis, workflowStatuses] = await Promise.all([
    listScPulloutsAction({
      page: Number(params.page) || 1,
      limit: parseTablePageSize(params.limit),
      sort: params.sort,
      sortDir: params.dir,
    }),
    getScPulloutKpisAction(),
    loadWorkflowCatalog(session.user.tenantId, "pullout_workflow"),
  ]);
  const currentUserName = session.user.name?.trim() || session.user.email || "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service center pull-outs"
        sticky={false}
        tutorial={SC_PULLOUTS_PAGE_TUTORIAL}
        description="Request a pull-out, approve it, save the logistics list, then send it. Sending puts the units in transit and ends the pull-out."
      />
      <ModuleGuide {...SC_OPS_MODULE_GUIDE} />
      <PulloutKpisStrip kpis={kpis} />
      <ScPulloutSourceProvider>
        <PulloutsPanel
          pullouts={pullouts}
          capabilities={resolveScPulloutCapabilities(session.user.permissions)}
          workflowStatuses={workflowStatuses}
          currentUserName={currentUserName}
          initialSort={params.sort ?? ""}
          initialSortDir={params.dir ?? "desc"}
        />
      </ScPulloutSourceProvider>
    </div>
  );
}
