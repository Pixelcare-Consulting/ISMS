import Link from "next/link";

import { ORDER_WORKFLOW_DESCRIPTION } from "@/features/orders/constants/order-workflow";
import {
  BRANCH_ORDER_TYPE_LABELS,
} from "@/features/orders/constants/order-status";
import {
  getOrdersKpisAction,
  listOrdersAction,
} from "@/features/orders/actions/order.actions";
import {
  hasOrderPermission,
  ORDER_TYPE_ROUTE,
  orderTypeAccessPermissions,
} from "@/features/orders/constants/order-permissions";
import { OrderKpisStrip } from "@/features/orders/components/order-kpis";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { BRANCH_ORDERS_PAGE_TUTORIAL } from "@/content/page-tutorials/branch-orders";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { OrdersTable } from "@/app/(app)/orders/_components/orders-table";
import { Button } from "@/components/ui/button";
import type { BranchOrderType } from "@prisma/client";

interface OrdersTypePageProps {
  orderType: BranchOrderType;
  searchParams: Promise<{ page?: string; limit?: string }>;
}

export async function OrdersTypePage({
  orderType,
  searchParams,
}: OrdersTypePageProps) {
  const session = await requireAnyPermission(orderTypeAccessPermissions(orderType));
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const limit = parseTablePageSize(params.limit);
  const [result, kpis] = await Promise.all([
    listOrdersAction({ page, limit, orderType }),
    getOrdersKpisAction(orderType),
  ]);
  const viewerRoleSlugs = session.user.roleSlugs ?? [];
  const canEdit = hasOrderPermission(session.user.permissions, orderType, "create");
  const typeLabel = BRANCH_ORDER_TYPE_LABELS[orderType];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${typeLabel} orders`}
        sticky={false}
        tutorial={BRANCH_ORDERS_PAGE_TUTORIAL}
        description={`${ORDER_WORKFLOW_DESCRIPTION} Showing ${typeLabel.toLowerCase()} orders only.${
          orderType === "auto_replenish"
            ? " Suggestions are generated under Settings → Planning."
            : ""
        }`}
        actions={
          <Button variant="outline" asChild>
            <Link href="/settings/planning">Planning & suggestions</Link>
          </Button>
        }
      />
      <OrderKpisStrip kpis={kpis} />
      <OrdersTable
        result={result}
        viewerRoleSlugs={viewerRoleSlugs}
        canEdit={canEdit}
        fixedOrderType={orderType}
        basePath={ORDER_TYPE_ROUTE[orderType]}
      />
    </div>
  );
}
