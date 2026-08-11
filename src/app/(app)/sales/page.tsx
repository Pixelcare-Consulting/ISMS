import Link from "next/link";
import { Plus } from "lucide-react";
import { redirect } from "next/navigation";

import {
  listSalesAction,
  listSalesReturnsAction,
} from "@/features/sales/actions/sales.actions";
import {
  canAccessSales,
  resolveSalesCapabilities,
} from "@/features/sales/constants/sales-permissions";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { ModuleGuide } from "@/components/module-guide";
import { requireAuth } from "@/lib/auth/permissions";
import { pageMetadata } from "@/lib/shared/seo";
import { SALES_MODULE_GUIDE } from "@/content/module-guides/sales";
import { SALES_PAGE_TUTORIAL } from "@/content/page-tutorials/sales";
import { PageHeader } from "@/app/(app)/_components/page-header";
import {
  SalesPageTabs,
  type SalesPageTab,
} from "@/app/(app)/sales/_components/sales-page-tabs";
import { SalesReturnsTable } from "@/app/(app)/sales/_components/sales-returns-table";
import { SalesTable } from "@/app/(app)/sales/_components/sales-table";
import { Button } from "@/components/ui/button";

export const metadata = pageMetadata(
  "Sales & ATR",
  "Branch sales with multi-line encode, reserved (RSV) flow, and ATR return workflow.",
);

interface SalesPageProps {
  searchParams: Promise<{
    tab?: string;
    page?: string;
    limit?: string;
    sort?: string;
    dir?: string;
  }>;
}

function parseSalesTab(value?: string): SalesPageTab {
  return value === "returns" ? "returns" : "sales";
}

export default async function SalesPage({ searchParams }: SalesPageProps) {
  const session = await requireAuth();
  if (!canAccessSales(session.user.permissions)) {
    redirect("/dashboard?error=forbidden");
  }

  const capabilities = resolveSalesCapabilities(session.user.permissions);
  const showSalesTab = capabilities.canViewSalesList;
  const showReturnsTab = capabilities.canViewReturns;

  if (!showSalesTab && !showReturnsTab) {
    redirect("/dashboard?error=forbidden");
  }

  const params = await searchParams;
  const requestedTab = parseSalesTab(params.tab);

  let activeTab: SalesPageTab = requestedTab;
  if (showReturnsTab && !showSalesTab) {
    activeTab = "returns";
    if (params.tab !== "returns") {
      redirect("/sales?tab=returns");
    }
  } else if (showSalesTab && !showReturnsTab) {
    activeTab = "sales";
    if (params.tab === "returns") {
      redirect("/sales");
    }
  }

  const page = Number(params.page) || 1;
  const limit = parseTablePageSize(params.limit);
  const listInput = {
    page,
    limit,
    sort: params.sort,
    sortDir: params.dir,
  };

  const [salesResult, returnsResult] = await Promise.all([
    activeTab === "sales" && showSalesTab
      ? listSalesAction(listInput)
      : Promise.resolve(null),
    activeTab === "returns" && showReturnsTab
      ? listSalesReturnsAction(listInput)
      : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales & ATR"
        sticky={false}
        tutorial={SALES_PAGE_TUTORIAL}
        description="Branch sales with multi-line encode, reserved (RSV) flow, and ATR return workflow."
        actions={
          capabilities.canCreateSale ? (
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
      <SalesPageTabs
        activeTab={activeTab}
        showSalesTab={showSalesTab}
        showReturnsTab={showReturnsTab}
        salesContent={
          salesResult ? (
            <SalesTable
              result={salesResult}
              capabilities={capabilities}
              initialSort={params.sort ?? ""}
              initialSortDir={params.dir ?? "desc"}
            />
          ) : null
        }
        returnsContent={
          returnsResult ? (
            <SalesReturnsTable
              result={returnsResult}
              capabilities={capabilities}
              initialSort={params.sort ?? ""}
              initialSortDir={params.dir ?? "desc"}
            />
          ) : null
        }
      />
    </div>
  );
}
