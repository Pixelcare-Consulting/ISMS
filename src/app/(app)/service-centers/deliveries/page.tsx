import { redirect } from "next/navigation";

import { listScDeliveriesAction } from "@/features/service-center-ops/actions/sc-logistics.actions";
import {
  canAccessScLogistics,
  resolveScLogisticsCapabilities,
} from "@/features/service-center-ops/constants/sc-permissions";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { ModuleGuide } from "@/components/module-guide";
import { SC_OPS_MODULE_GUIDE } from "@/content/module-guides/service-center-ops";
import { SC_DELIVERIES_PAGE_TUTORIAL } from "@/content/page-tutorials/service-center-ops";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { ScDeliveriesPanel } from "@/app/(app)/service-centers/deliveries/_components/sc-deliveries-panel";
import { requireAuth } from "@/lib/auth/permissions";
import { pageMetadata } from "@/lib/shared/seo";

export const metadata = pageMetadata(
  "Service center deliveries",
  "Accept deliveries into service center inventory.",
);

interface PageProps {
  searchParams: Promise<{ page?: string; limit?: string }>;
}

export default async function ScDeliveriesPage({ searchParams }: PageProps) {
  const session = await requireAuth();
  if (!canAccessScLogistics(session.user.permissions)) {
    redirect("/dashboard?error=forbidden");
  }

  const params = await searchParams;
  const result = await listScDeliveriesAction({
    page: Number(params.page) || 1,
    limit: parseTablePageSize(params.limit),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service center deliveries"
        sticky={false}
        tutorial={SC_DELIVERIES_PAGE_TUTORIAL}
        description="Accept serials from approved orders into service center STK stock."
      />
      <ModuleGuide {...SC_OPS_MODULE_GUIDE} />
      <ScDeliveriesPanel
        items={result.items}
        capabilities={resolveScLogisticsCapabilities(session.user.permissions)}
      />
    </div>
  );
}
