import Link from "next/link";

import { BRANCH_ORDER_TYPE_LABELS } from "@/features/orders/constants/order-status";
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
import { ModuleGuide } from "@/components/module-guide";
import { hasPermission, requireAnyPermission } from "@/lib/auth/permissions";
import { ORDERS_MODULE_GUIDE } from "@/content/module-guides/orders";
import { BRANCH_ORDERS_PAGE_TUTORIAL } from "@/content/page-tutorials/branch-orders";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { OrdersTable } from "@/app/(app)/orders/_components/orders-table";
import { Button } from "@/components/ui/button";
import type { BranchOrderType } from "@prisma/client";

interface OrdersTypePageProps {
  orderType: BranchOrderType;
  searchParams: Promise<{
    page?: string;
    limit?: string;
    sort?: string;
    dir?: string;
  }>;
}

function ordersTypePageDescription(orderType: BranchOrderType): string {
  switch (orderType) {
    case "auto_replenish":
      return "Showing auto replenish orders only. Suggestions are generated under Settings → Planning.";
    case "manual":
      return "Showing manual orders only. Review path: Product Specialist → Team Leader → Supply Planning.";
    case "special":
      return "Showing special orders only. Team Leaders create these requests; Supply Planning gives final approval.";
    default: {
      const _exhaustive: never = orderType;
      return _exhaustive;
    }
  }
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
    listOrdersAction({ page, limit, orderType, sort: params.sort, sortDir: params.dir }),
    getOrdersKpisAction(orderType),
  ]);
  const viewerRoleSlugs = session.user.roleSlugs ?? [];
  const canEdit = hasOrderPermission(session.user.permissions, orderType, "create");
  const canAccessSuggestedOrders =
    hasPermission(session.user.permissions, "forecast.manage") ||
    hasPermission(session.user.permissions, "planogram.manage");
  const typeLabel = BRANCH_ORDER_TYPE_LABELS[orderType];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${typeLabel} orders`}
        sticky={false}
        tutorial={BRANCH_ORDERS_PAGE_TUTORIAL}
        description={ordersTypePageDescription(orderType)}
        actions={
          canAccessSuggestedOrders ? (
            <Button variant="outline" asChild>
              <Link href="/settings/planning">Planning & suggestions</Link>
            </Button>
          ) : undefined
        }
      />
      <ModuleGuide {...ORDERS_MODULE_GUIDE} />
      <OrderKpisStrip kpis={kpis} />
      <OrdersTable
        result={result}
        viewerRoleSlugs={viewerRoleSlugs}
        canEdit={canEdit}
        canAccessSuggestedOrders={canAccessSuggestedOrders}
        fixedOrderType={orderType}
        basePath={ORDER_TYPE_ROUTE[orderType]}
        initialSort={params.sort ?? ""}
        initialSortDir={params.dir ?? "desc"}
      />
    </div>
  );
}
