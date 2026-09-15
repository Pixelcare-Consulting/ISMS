import Link from "next/link";

import { BRANCH_ORDER_TYPE_LABELS } from "@/features/orders/constants/order-status";
import {
  getOrdersKpisAction,
  listOrderHistoryAction,
  listOrdersAction,
} from "@/features/orders/actions/order.actions";
import {
  hasOrderPermission,
  ORDER_TYPE_ROUTE,
  orderTypeAccessPermissions,
} from "@/features/orders/constants/order-permissions";
import { OrderKpisSummary } from "@/features/orders/components/order-kpis";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { ModuleGuide } from "@/components/module-guide";
import { hasPermission, requireAnyPermission } from "@/lib/auth/permissions";
import { ordersModuleGuideForType } from "@/content/module-guides/orders";
import { BRANCH_ORDERS_PAGE_TUTORIAL } from "@/content/page-tutorials/branch-orders";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { OrderAnalyticsPanel } from "@/app/(app)/orders/_components/order-analytics-panel";
import { OrderHistoryTable } from "@/app/(app)/orders/_components/order-history-table";
import { OrdersCreateWorkspaceProvider } from "@/app/(app)/orders/_components/orders-create-workspace-context";
import { OrdersPageTabs } from "@/app/(app)/orders/_components/orders-page-tabs";
import {
  ordersPageTabsForType,
  parseOrdersPageTab,
} from "@/features/orders/constants/orders-page-tabs";
import { OrdersTable } from "@/app/(app)/orders/_components/orders-table";
import { Button } from "@/components/ui/button";
import type { BranchOrderType } from "@prisma/client";

interface OrdersTypePageProps {
  orderType: BranchOrderType;
  searchParams: Promise<{
    tab?: string;
    page?: string;
    limit?: string;
    sort?: string;
    dir?: string;
  }>;
}

function ordersTypePageDescription(orderType: BranchOrderType): string {
  switch (orderType) {
    case "auto_replenish":
      return "Showing auto replenish requests waiting for your role. Approved orders are in Order History. Suggestions are generated under Settings → Planning.";
    case "manual":
      return "Showing manual requests waiting for your role. Approved orders are in Order History. Review path: Product Specialist → Team Leader → Supply Planning.";
    case "special":
      return "Showing special requests waiting for your role. Approved orders are in Order History. Team Leaders create these requests; Supply Planning gives final approval.";
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
  const pageTabs = ordersPageTabsForType(orderType);
  const showAnalytics = pageTabs.includes("analytics");
  const activeTab = parseOrdersPageTab(params.tab, pageTabs);
  const page = Number(params.page) || 1;
  const limit = parseTablePageSize(params.limit);
  const viewerRoleSlugs = session.user.roleSlugs ?? [];
  const canEdit = hasOrderPermission(session.user.permissions, orderType, "create");
  const canAccessSuggestedOrders =
    hasPermission(session.user.permissions, "forecast.manage") ||
    hasPermission(session.user.permissions, "planogram.manage");
  const typeLabel = BRANCH_ORDER_TYPE_LABELS[orderType];
  const basePath = ORDER_TYPE_ROUTE[orderType];

  const [kpis, ordersResult, historyResult] = await Promise.all([
    getOrdersKpisAction(orderType),
    activeTab === "orders"
      ? listOrdersAction({
          page,
          limit,
          orderType,
          sort: params.sort,
          sortDir: params.dir,
        })
      : Promise.resolve(null),
    activeTab === "history"
      ? listOrderHistoryAction({
          page,
          limit,
          orderType,
          sort: params.sort,
          sortDir: params.dir,
        })
      : Promise.resolve(null),
  ]);

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
      <ModuleGuide {...ordersModuleGuideForType(orderType)} />
      <OrdersCreateWorkspaceProvider
        orderType={orderType}
        canEdit={canEdit}
        canAccessSuggestedOrders={canAccessSuggestedOrders}
      >
        <OrdersPageTabs
          activeTab={activeTab}
          basePath={basePath}
          tabs={pageTabs}
          ordersContent={
            ordersResult ? (
              <div className="space-y-4">
                <OrderKpisSummary kpis={kpis} />
                <OrdersTable
                  result={ordersResult}
                  viewerRoleSlugs={viewerRoleSlugs}
                  canEdit={canEdit}
                  canAccessSuggestedOrders={canAccessSuggestedOrders}
                  fixedOrderType={orderType}
                  basePath={basePath}
                  initialSort={params.sort ?? ""}
                  initialSortDir={params.dir ?? "desc"}
                />
              </div>
            ) : null
          }
          analyticsContent={
            showAnalytics && activeTab === "analytics" ? (
              <OrderAnalyticsPanel key={orderType} orderType={orderType} />
            ) : null
          }
          historyContent={
            historyResult ? (
              <OrderHistoryTable
                result={historyResult}
                basePath={basePath}
                initialSort={params.sort ?? "createdAt"}
                initialSortDir={params.dir ?? "desc"}
              />
            ) : null
          }
        />
      </OrdersCreateWorkspaceProvider>
    </div>
  );
}
