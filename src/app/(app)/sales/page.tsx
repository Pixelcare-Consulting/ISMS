import Link from "next/link";
import { Plus } from "lucide-react";
import { redirect } from "next/navigation";

import { listSalesAction, getSalesKpisAction } from "@/features/sales/actions/sales.actions";
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
import { SalesTable } from "@/app/(app)/sales/_components/sales-table";
import { SalesKpisStrip } from "@/features/sales/components/sales-kpis";
import { Button } from "@/components/ui/button";

export const metadata = pageMetadata(
  "Sales",
  "Branch sales with multi-line encode, reserved (RSV) flow, and request return from sale details.",
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

export default async function SalesPage({ searchParams }: SalesPageProps) {
  const session = await requireAuth();
  if (!canAccessSales(session.user.permissions)) {
    redirect("/dashboard?error=forbidden");
  }

  const capabilities = resolveSalesCapabilities(session.user.permissions);
  if (!capabilities.canViewSalesList) {
    redirect("/dashboard?error=forbidden");
  }

  const params = await searchParams;
  if (params.tab === "returns") {
    redirect("/returns?tab=branch");
  }

  const page = Number(params.page) || 1;
  const limit = parseTablePageSize(params.limit);
  const [result, kpis] = await Promise.all([
    listSalesAction({
      page,
      limit,
      sort: params.sort,
      sortDir: params.dir,
    }),
    getSalesKpisAction(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales"
        sticky={false}
        tutorial={SALES_PAGE_TUTORIAL}
        description="Encode branch sales with package detail sets and reserved (RSV) flow. Request a return from View details; track it under Returns / Replacement."
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
      <SalesKpisStrip kpis={kpis} />
      <SalesTable
        result={result}
        capabilities={capabilities}
        initialSort={params.sort ?? ""}
        initialSortDir={params.dir ?? "desc"}
      />
    </div>
  );
}
