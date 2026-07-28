import Link from "next/link";

import { ORDER_WORKFLOW_DESCRIPTION } from "@/features/orders/constants/order-workflow";
import {
  getOrdersKpisAction,
  listOrdersAction,
} from "@/features/orders/actions/order.actions";
import { OrderKpisStrip } from "@/features/orders/components/order-kpis";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { hasPermission, requireAuth, requirePermission } from "@/lib/auth/permissions";
import { BRANCH_ORDERS_PAGE_TUTORIAL } from "@/content/page-tutorials/branch-orders";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { OrdersTable } from "@/app/(app)/orders/_components/orders-table";
import { Button } from "@/components/ui/button";

interface OrdersPageProps {
  searchParams: Promise<{ page?: string; limit?: string }>;
}

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const session = await requireAuth();
  await requirePermission("orders.view");
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const limit = parseTablePageSize(params.limit);
  const [result, kpis] = await Promise.all([
    listOrdersAction({ page, limit }),
    getOrdersKpisAction(),
  ]);
  const viewerRoleSlugs = session.user.roleSlugs ?? [];
  const canEdit = hasPermission(session.user.permissions, "orders.create");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Branch orders"
        // sticky table header: keep page title non-sticky so it does not cover frozen column headers
        sticky={false}
        tutorial={BRANCH_ORDERS_PAGE_TUTORIAL}
        description={`${ORDER_WORKFLOW_DESCRIPTION} Auto-replenish suggestions are generated under Settings → Planning.`}
        actions={
          <Button variant="outline" asChild>
            <Link href="/settings/planning">Planning & suggestions</Link>
          </Button>
        }
      />
      <OrderKpisStrip kpis={kpis} />
      <OrdersTable result={result} viewerRoleSlugs={viewerRoleSlugs} canEdit={canEdit} />
    </div>
  );
}
