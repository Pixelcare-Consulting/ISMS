import Link from "next/link";

import { ORDER_WORKFLOW_DESCRIPTION } from "@/features/orders/constants/order-workflow";
import { listOrdersAction } from "@/features/orders/actions/order.actions";
import { requireAuth, requirePermission } from "@/lib/auth/permissions";
import { BRANCH_ORDERS_PAGE_TUTORIAL } from "@/content/page-tutorials/branch-orders";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { OrdersTable } from "@/app/(app)/orders/_components/orders-table";
import { Button } from "@/components/ui/button";

interface OrdersPageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const session = await requireAuth();
  await requirePermission("orders.view");
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const result = await listOrdersAction({ page });
  const viewerRoleSlugs = session.user.roleSlugs ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Branch orders"
        tutorial={BRANCH_ORDERS_PAGE_TUTORIAL}
        description={`${ORDER_WORKFLOW_DESCRIPTION} Auto-replenish suggestions are generated under Settings → Planning.`}
        actions={
          <Button variant="outline" asChild>
            <Link href="/settings/planning">Planning & suggestions</Link>
          </Button>
        }
      />
      <OrdersTable result={result} viewerRoleSlugs={viewerRoleSlugs} />
    </div>
  );
}
