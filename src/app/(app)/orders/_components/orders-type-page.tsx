import Link from "next/link";
import { redirect } from "next/navigation";

import { BRANCH_ORDER_TYPE_LABELS } from "@/features/orders/constants/order-status";
import {
  getOrdersKpisAction,
  listManualSpecialTeamLeadersAction,
  listOrderHistoryAction,
  listOrdersAction,
  listOrderTeamLeadersAction,
} from "@/features/orders/actions/order.actions";
import {
  canAccessOrderType,
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
import { OrderHistoryTable } from "@/app/(app)/orders/_components/order-history-table";
import { OrdersCreateWorkspaceProvider } from "@/app/(app)/orders/_components/orders-create-workspace-context";
import { OrdersPageTabs } from "@/app/(app)/orders/_components/orders-page-tabs";
import {
  ordersPageTabsForType,
  parseOrdersPageTab,
} from "@/features/orders/constants/orders-page-tabs";
import {
  parseManualSpecialTypeFilter,
  type ManualSpecialTypeFilter,
} from "@/features/orders/lib/manual-special-order-scope";
import { OrdersTable } from "@/app/(app)/orders/_components/orders-table";
import { Button } from "@/components/ui/button";
import type { BranchOrderType } from "@prisma/client";

interface OrdersTypePageProps {
  orderType: BranchOrderType;
  /** Manual and Special share this page. Auto replenish stays a single type. */
  combinedManualSpecial?: boolean;
  searchParams: Promise<{
    tab?: string;
    page?: string;
    limit?: string;
    sort?: string;
    dir?: string;
    /** Team Leader user id filter on the Orders tab. */
    tl?: string;
    /** all | manual | special. Default all. Combined list only. */
    type?: string;
  }>;
}

function ordersTypePageDescription(orderType: BranchOrderType): string {
  switch (orderType) {
    case "auto_replenish":
      return "Showing auto replenish requests waiting for your role. Approved orders are in Order History. Review suggestions from Suggested Orders on this screen. They are not submitted until you submit the draft.";
    case "manual":
      return "Showing manual requests waiting for your role. Approved orders are in Order History. Path: Product Specialist submits → Pending SP (Team Leader may optionally edit) → Supply Planning approves.";
    case "special":
      return "Showing special requests on this list, including a special order you submitted. Approved orders are in Order History. Team Leaders create these requests; Supply Planning gives final approval.";
    default: {
      const _exhaustive: never = orderType;
      return _exhaustive;
    }
  }
}

function combinedOrdersTitle(
  filter: ManualSpecialTypeFilter,
  canAccessManual: boolean,
  canAccessSpecial: boolean,
): string {
  switch (filter) {
    case "all":
      if (canAccessManual && canAccessSpecial) return "Manual and special orders";
      if (canAccessSpecial) return "Special orders";
      return "Manual orders";
    case "manual":
      return "Manual orders";
    case "special":
      return "Special orders";
    default: {
      const _exhaustive: never = filter;
      return _exhaustive;
    }
  }
}

function combinedOrdersDescription(
  filter: ManualSpecialTypeFilter,
  canAccessManual: boolean,
  canAccessSpecial: boolean,
): string {
  switch (filter) {
    case "all":
      if (canAccessManual && !canAccessSpecial) return ordersTypePageDescription("manual");
      if (canAccessSpecial && !canAccessManual) return ordersTypePageDescription("special");
      return "Showing manual and special requests waiting for your role, including a special order you submitted. Approved orders are in Order History. Use the type filter to see one kind of order. Each order keeps its own approval path.";
    case "manual":
      return ordersTypePageDescription("manual");
    case "special":
      return ordersTypePageDescription("special");
    default: {
      const _exhaustive: never = filter;
      return _exhaustive;
    }
  }
}

function combinedListHref(
  filter: ManualSpecialTypeFilter,
  current: {
    tab?: string;
    limit?: string;
    sort?: string;
    dir?: string;
    tl?: string;
  },
): string {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("type", filter);
  if (current.tab && current.tab !== "orders") params.set("tab", current.tab);
  if (current.limit) params.set("limit", current.limit);
  if (current.sort) params.set("sort", current.sort);
  if (current.sort && current.dir) params.set("dir", current.dir);
  if (current.tl && current.tab !== "history") params.set("tl", current.tl);
  const query = params.toString();
  return query ? `/orders/manual?${query}` : "/orders/manual";
}

function createOrderHref(
  filter: ManualSpecialTypeFilter,
  canCreateManual: boolean,
  canCreateSpecial: boolean,
): string | null {
  switch (filter) {
    case "manual":
      return canCreateManual ? "/orders/manual/new?type=manual" : null;
    case "special":
      return canCreateSpecial ? "/orders/manual/new?type=special" : null;
    case "all":
      return canCreateManual || canCreateSpecial ? "/orders/manual/new" : null;
    default: {
      const _exhaustive: never = filter;
      return _exhaustive;
    }
  }
}

function suggestionOrderTypeFor(
  filter: ManualSpecialTypeFilter,
  canCreateManual: boolean,
  canCreateSpecial: boolean,
): "manual" | "special" | undefined {
  switch (filter) {
    case "manual":
      return canCreateManual ? "manual" : undefined;
    case "special":
      return canCreateSpecial ? "special" : undefined;
    case "all":
      if (canCreateManual) return "manual";
      if (canCreateSpecial) return "special";
      return undefined;
    default: {
      const _exhaustive: never = filter;
      return _exhaustive;
    }
  }
}

export async function OrdersTypePage({
  orderType,
  combinedManualSpecial = false,
  searchParams,
}: OrdersTypePageProps) {
  const session = await requireAnyPermission(
    combinedManualSpecial
      ? [...orderTypeAccessPermissions("manual"), ...orderTypeAccessPermissions("special")]
      : orderTypeAccessPermissions(orderType),
  );
  const params = await searchParams;
  const canAccessManual = canAccessOrderType(session.user.permissions, "manual");
  const canAccessSpecial = canAccessOrderType(session.user.permissions, "special");
  const requestedFilter = parseManualSpecialTypeFilter(params.type);

  if (combinedManualSpecial && requestedFilter === "manual" && !canAccessManual) {
    redirect(canAccessSpecial ? "/orders/manual?type=special" : "/dashboard?error=forbidden");
  }
  if (combinedManualSpecial && requestedFilter === "special" && !canAccessSpecial) {
    redirect(canAccessManual ? "/orders/manual" : "/dashboard?error=forbidden");
  }

  const listFilter: ManualSpecialTypeFilter = combinedManualSpecial ? requestedFilter : "all";
  const pageTabs = ordersPageTabsForType(combinedManualSpecial ? "manual" : orderType);
  const activeTab = parseOrdersPageTab(params.tab, pageTabs);
  const page = Number(params.page) || 1;
  const limit = parseTablePageSize(params.limit);
  const viewerRoleSlugs = session.user.roleSlugs ?? [];
  const canCreateManual = hasOrderPermission(session.user.permissions, "manual", "create");
  const canCreateSpecial = hasOrderPermission(session.user.permissions, "special", "create");
  const canEdit = combinedManualSpecial
    ? listFilter === "special"
      ? canCreateSpecial
      : listFilter === "manual"
        ? canCreateManual
        : canCreateManual || canCreateSpecial
    : hasOrderPermission(session.user.permissions, orderType, "create");
  const canAccessSuggestedOrders =
    hasPermission(session.user.permissions, "forecast.manage") ||
    hasPermission(session.user.permissions, "planogram.manage");
  const typeLabel = BRANCH_ORDER_TYPE_LABELS[orderType];
  const basePath = combinedManualSpecial ? "/orders/manual" : ORDER_TYPE_ROUTE[orderType];
  const preserved = {
    tab: params.tab,
    limit: params.limit,
    sort: params.sort,
    dir: params.dir,
    tl: params.tl,
  };

  const teamLeaderId = params.tl?.trim() || undefined;
  const [kpis, ordersResult, historyResult, teamLeaders] = await Promise.all([
    combinedManualSpecial
      ? getOrdersKpisAction(undefined, listFilter)
      : getOrdersKpisAction(orderType),
    activeTab === "orders"
      ? listOrdersAction(
          combinedManualSpecial
            ? {
                page,
                limit,
                listFilter,
                sort: params.sort,
                sortDir: params.dir,
                teamLeaderId,
              }
            : {
                page,
                limit,
                orderType,
                sort: params.sort,
                sortDir: params.dir,
                teamLeaderId,
              },
        )
      : Promise.resolve(null),
    activeTab === "history"
      ? listOrderHistoryAction(
          combinedManualSpecial
            ? {
                page,
                limit,
                listFilter,
                sort: params.sort,
                sortDir: params.dir,
              }
            : {
                page,
                limit,
                orderType,
                sort: params.sort,
                sortDir: params.dir,
              },
        )
      : Promise.resolve(null),
    activeTab === "orders"
      ? combinedManualSpecial
        ? listManualSpecialTeamLeadersAction()
        : listOrderTeamLeadersAction(orderType)
      : Promise.resolve([]),
  ]);

  const typeOptions: { id: ManualSpecialTypeFilter; label: string }[] = combinedManualSpecial
    ? [
        { id: "all", label: "All" },
        ...(canAccessManual ? [{ id: "manual" as const, label: "Manual" }] : []),
        ...(canAccessSpecial ? [{ id: "special" as const, label: "Special" }] : []),
      ]
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          combinedManualSpecial
            ? combinedOrdersTitle(listFilter, canAccessManual, canAccessSpecial)
            : `${typeLabel} orders`
        }
        sticky={false}
        tutorial={BRANCH_ORDERS_PAGE_TUTORIAL}
        description={
          combinedManualSpecial
            ? combinedOrdersDescription(listFilter, canAccessManual, canAccessSpecial)
            : ordersTypePageDescription(orderType)
        }
        actions={
          canAccessSuggestedOrders ? (
            <Button variant="outline" asChild>
              <Link href="/settings/planning">Planning</Link>
            </Button>
          ) : undefined
        }
      />
      <ModuleGuide
        {...(combinedManualSpecial
          ? ordersModuleGuideForType(listFilter === "special" ? "special" : "manual")
          : ordersModuleGuideForType(orderType))}
      />
      <OrdersCreateWorkspaceProvider
        orderType={combinedManualSpecial ? "manual" : orderType}
        canEdit={canEdit}
        canCreateSpecial={canCreateSpecial}
      >
        <OrdersPageTabs
          activeTab={activeTab}
          basePath={basePath}
          tabs={pageTabs}
          typeFilter={combinedManualSpecial ? listFilter : undefined}
          ordersContent={
            ordersResult ? (
              <div className="space-y-4">
                <OrderKpisSummary kpis={kpis} />
                {typeOptions.length > 1 ? (
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Order type">
                    {typeOptions.map((option) => {
                      const selected = option.id === listFilter;
                      return (
                        <Button
                          key={option.id}
                          variant={selected ? "default" : "outline"}
                          size="sm"
                          asChild
                        >
                          <Link
                            href={combinedListHref(option.id, preserved)}
                            role="radio"
                            aria-checked={selected}
                          >
                            {option.label}
                          </Link>
                        </Button>
                      );
                    })}
                  </div>
                ) : null}
                <OrdersTable
                  result={ordersResult}
                  viewerRoleSlugs={viewerRoleSlugs}
                  canEdit={canEdit}
                  fixedOrderType={combinedManualSpecial ? undefined : orderType}
                  listFilter={combinedManualSpecial ? listFilter : undefined}
                  createHref={
                    combinedManualSpecial
                      ? createOrderHref(listFilter, canCreateManual, canCreateSpecial)
                      : undefined
                  }
                  createByType={
                    combinedManualSpecial
                      ? { manual: canCreateManual, special: canCreateSpecial }
                      : undefined
                  }
                  suggestionOrderType={
                    combinedManualSpecial
                      ? suggestionOrderTypeFor(listFilter, canCreateManual, canCreateSpecial)
                      : undefined
                  }
                  basePath={basePath}
                  initialSort={params.sort ?? ""}
                  initialSortDir={params.dir ?? "desc"}
                  teamLeaders={teamLeaders}
                />
              </div>
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
