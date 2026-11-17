import { redirect } from "next/navigation";

import { listScCentersForOpsAction } from "@/features/service-center-ops/actions/sc-inventory.actions";
import { listScOrdersAction } from "@/features/service-center-ops/actions/sc-orders.actions";
import {
  canAccessScOrders,
  canApproveScOrders,
  SC_ORDERS_CREATE,
} from "@/features/service-center-ops/constants/sc-permissions";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { ModuleGuide } from "@/components/module-guide";
import { SC_OPS_MODULE_GUIDE } from "@/content/module-guides/service-center-ops";
import { SC_ORDERS_PAGE_TUTORIAL } from "@/content/page-tutorials/service-center-ops";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { ScOrdersPanel } from "@/app/(app)/service-centers/orders/_components/sc-orders-panel";
import { hasPermission, requireAuth } from "@/lib/auth/permissions";
import { pageMetadata } from "@/lib/shared/seo";

export const metadata = pageMetadata(
  "Service center orders",
  "Create and approve service center manual orders.",
);

interface PageProps {
  searchParams: Promise<{ page?: string; limit?: string }>;
}

export default async function ScOrdersPage({ searchParams }: PageProps) {
  const session = await requireAuth();
  if (!canAccessScOrders(session.user.permissions)) {
    redirect("/dashboard?error=forbidden");
  }

  const params = await searchParams;
  const [result, centers] = await Promise.all([
    listScOrdersAction({
      page: Number(params.page) || 1,
      limit: parseTablePageSize(params.limit),
    }),
    listScCentersForOpsAction(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service center orders"
        sticky={false}
        tutorial={SC_ORDERS_PAGE_TUTORIAL}
        description="Supply Planning approves each order, which posts the Sales Order to SAP. Once SAP copies it to a DR, Check SAP now on Deliveries brings the DR in."
      />
      <ModuleGuide {...SC_OPS_MODULE_GUIDE} />
      <ScOrdersPanel
        items={result.items}
        centers={centers}
        canCreate={hasPermission(session.user.permissions, SC_ORDERS_CREATE)}
        canApprove={canApproveScOrders(session.user.permissions, session.user.roleSlugs)}
      />
    </div>
  );
}
