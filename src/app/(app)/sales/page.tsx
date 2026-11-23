import Link from "next/link";
import { Plus } from "lucide-react";
import { redirect } from "next/navigation";

import { listSalesAction, getSalesKpisAction } from "@/features/sales/actions/sales.actions";
import { parseSalesListStatusFilter } from "@/features/sales/constants/sales-list-status";
import {
  canAccessSales,
  resolveSalesCapabilities,
} from "@/features/sales/constants/sales-permissions";
import {
  buildSalesPageHref,
  DEFAULT_SALES_PAGE_TAB,
  parseSalesPageTab,
  type SalesPageTab,
} from "@/features/sales/utils/sales-page-href";
import {
  getScSalesKpisAction,
  listScSalesAction,
} from "@/features/service-center-ops/actions/sc-sales.actions";
import {
  canAccessScSales,
  resolveScSalesCapabilities,
} from "@/features/service-center-ops/constants/sc-permissions";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { ModuleGuide } from "@/components/module-guide";
import { requireAuth } from "@/lib/auth/permissions";
import { pageMetadata } from "@/lib/shared/seo";
import { SALES_MODULE_GUIDE } from "@/content/module-guides/sales";
import { SALES_PAGE_TUTORIAL } from "@/content/page-tutorials/sales";
import { SC_SALES_PAGE_TUTORIAL } from "@/content/page-tutorials/service-center-ops";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { SalesPageTabs } from "@/app/(app)/sales/_components/sales-page-tabs";
import { SalesTable } from "@/app/(app)/sales/_components/sales-table";
import { ScSalesSourceProvider } from "@/app/(app)/sales/_components/sc-sales-source";
import { SalesKpisStrip } from "@/features/sales/components/sales-kpis";
import { Button } from "@/components/ui/button";

export const metadata = pageMetadata(
  "Sales",
  "Branch sales with multi-line encode, reserved (RSV) flow, and request return from sale details. The Service Center tab lists sales sent to a service center for a Service Return or Replacement.",
);

const TAB_DESCRIPTIONS: Record<SalesPageTab, string> = {
  branch:
    "Encode branch sales with package detail sets and reserved (RSV) flow. Request a return from View details; track it under Returns / Replacement. A Service Return or Service Replacement goes to the service center you pick.",
  "service-center":
    "Copies of branch sales whose Service Return or Service Replacement went to a service center. The service center finishes them in SC Returns and Replacement; the status here and on the branch sale follows it.",
};

interface SalesPageProps {
  searchParams: Promise<{
    tab?: string;
    page?: string;
    limit?: string;
    sort?: string;
    dir?: string;
    status?: string;
    q?: string;
  }>;
}

/** Tabs this user may open, branch first. */
function allowedSalesTabs(permissions: string[] | undefined): SalesPageTab[] {
  const tabs: SalesPageTab[] = [];
  if (canAccessSales(permissions) && resolveSalesCapabilities(permissions).canViewSalesList) {
    tabs.push("branch");
  }
  if (canAccessScSales(permissions)) tabs.push("service-center");
  return tabs;
}

export default async function SalesPage({ searchParams }: SalesPageProps) {
  const session = await requireAuth();
  const permissions = session.user.permissions;
  const params = await searchParams;
  if (params.tab === "returns") {
    redirect("/returns?tab=branch");
  }

  const allowedTabs = allowedSalesTabs(permissions);
  const firstTab = allowedTabs[0];
  if (!firstTab) {
    redirect("/dashboard?error=forbidden");
  }
  const requestedTab = parseSalesPageTab(params.tab) ?? DEFAULT_SALES_PAGE_TAB;
  if (!allowedTabs.includes(requestedTab)) {
    redirect(buildSalesPageHref({ tab: firstTab }));
  }
  const tab = requestedTab;

  const page = Number(params.page) || 1;
  const limit = parseTablePageSize(params.limit);
  const status = parseSalesListStatusFilter(params.status);
  const q = params.q?.trim() || undefined;
  const sortDir = params.sort
    ? params.dir === "asc"
      ? "asc"
      : "desc"
    : undefined;
  const listInput = { page, limit, sort: params.sort, sortDir: params.dir, status, q };

  const capabilities =
    tab === "branch"
      ? resolveSalesCapabilities(permissions)
      : resolveScSalesCapabilities(permissions);
  const [result, kpis] = await Promise.all(
    tab === "branch"
      ? [listSalesAction(listInput), getSalesKpisAction(q)]
      : [listScSalesAction(listInput), getScSalesKpisAction(q)],
  );

  const table = (
    <SalesTable
      result={result}
      capabilities={capabilities}
      initialSort={params.sort ?? ""}
      initialSortDir={params.dir ?? "desc"}
      searchQuery={q ?? ""}
    />
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales"
        sticky={false}
        tutorial={tab === "branch" ? SALES_PAGE_TUTORIAL : SC_SALES_PAGE_TUTORIAL}
        description={TAB_DESCRIPTIONS[tab]}
        actions={
          tab === "branch" && capabilities.canCreateSale ? (
            <Button asChild>
              <Link href="/sales/new">
                <Plus className="size-4" />
                New transaction
              </Link>
            </Button>
          ) : null
        }
      />
      <ModuleGuide {...SALES_MODULE_GUIDE} />
      <SalesPageTabs activeTab={tab} allowedTabs={allowedTabs}>
        <SalesKpisStrip
          kpis={kpis}
          status={status}
          q={q}
          limit={limit}
          sort={params.sort}
          sortDir={sortDir}
          tab={tab}
        />
        {tab === "branch" ? table : <ScSalesSourceProvider>{table}</ScSalesSourceProvider>}
      </SalesPageTabs>
    </div>
  );
}
