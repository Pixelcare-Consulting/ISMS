import { redirect } from "next/navigation";

import { listScCentersForOpsAction } from "@/features/service-center-ops/actions/sc-inventory.actions";
import { listScPulloutsAction } from "@/features/service-center-ops/actions/sc-logistics.actions";
import {
  canAccessScLogistics,
  resolveScLogisticsCapabilities,
} from "@/features/service-center-ops/constants/sc-permissions";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { ModuleGuide } from "@/components/module-guide";
import { SC_OPS_MODULE_GUIDE } from "@/content/module-guides/service-center-ops";
import { SC_PULLOUTS_PAGE_TUTORIAL } from "@/content/page-tutorials/service-center-ops";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { ScPulloutsPanel } from "@/app/(app)/service-centers/pullouts/_components/sc-pullouts-panel";
import { requireAuth } from "@/lib/auth/permissions";
import { pageMetadata } from "@/lib/shared/seo";

export const metadata = pageMetadata(
  "Service center pull-outs",
  "Create and complete pull-outs against service center inventory.",
);

interface PageProps {
  searchParams: Promise<{ page?: string; limit?: string }>;
}

export default async function ScPulloutsPage({ searchParams }: PageProps) {
  const session = await requireAuth();
  if (!canAccessScLogistics(session.user.permissions)) {
    redirect("/dashboard?error=forbidden");
  }

  const params = await searchParams;
  const [result, centers] = await Promise.all([
    listScPulloutsAction({
      page: Number(params.page) || 1,
      limit: parseTablePageSize(params.limit),
    }),
    listScCentersForOpsAction(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service center pull-outs"
        sticky={false}
        tutorial={SC_PULLOUTS_PAGE_TUTORIAL}
        description="Reserve, approve, and complete pull-outs from service center stock."
      />
      <ModuleGuide {...SC_OPS_MODULE_GUIDE} />
      <ScPulloutsPanel
        items={result.items}
        centers={centers}
        capabilities={resolveScLogisticsCapabilities(session.user.permissions)}
      />
    </div>
  );
}
