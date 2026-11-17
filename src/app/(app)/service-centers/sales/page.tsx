import Link from "next/link";
import { Plus } from "lucide-react";
import { redirect } from "next/navigation";

import {
  getScSalesKpisAction,
  listScSalesAction,
} from "@/features/service-center-ops/actions/sc-sales.actions";
import {
  canAccessScSales,
  resolveScSalesCapabilities,
} from "@/features/service-center-ops/constants/sc-permissions";
import { parseSalesListStatusFilter } from "@/features/sales/constants/sales-list-status";
import { SalesKpisStrip } from "@/features/sales/components/sales-kpis";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { ModuleGuide } from "@/components/module-guide";
import { Button } from "@/components/ui/button";
import { SC_OPS_MODULE_GUIDE } from "@/content/module-guides/service-center-ops";
import { SC_SALES_PAGE_TUTORIAL } from "@/content/page-tutorials/service-center-ops";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { SalesTable } from "@/app/(app)/sales/_components/sales-table";
import { ScSalesSourceProvider } from "@/app/(app)/service-centers/sales/_components/sc-sales-source";
import { requireAuth } from "@/lib/auth/permissions";
import { pageMetadata } from "@/lib/shared/seo";

const SC_SALES_HREF = "/service-centers/sales";

export const metadata = pageMetadata(
  "Service center sales",
  "Service center sales with multi-line encode and reserved (RSV) flow, sold from service center stock.",
);

interface ScSalesPageProps {
  searchParams: Promise<{
    page?: string;
    limit?: string;
    sort?: string;
    dir?: string;
    status?: string;
    q?: string;
  }>;
}

export default async function ScSalesPage({ searchParams }: ScSalesPageProps) {
  const session = await requireAuth();
  if (!canAccessScSales(session.user.permissions)) {
    redirect("/dashboard?error=forbidden");
  }
  const capabilities = resolveScSalesCapabilities(session.user.permissions);
  if (!capabilities.canViewSalesList) {
    redirect("/dashboard?error=forbidden");
  }

  const params = await searchParams;
  const page = Number(params.page) || 1;
  const limit = parseTablePageSize(params.limit);
  const status = parseSalesListStatusFilter(params.status);
  const q = params.q?.trim() || undefined;
  const sortDir = params.sort ? (params.dir === "asc" ? "asc" : "desc") : undefined;
  const [result, kpis] = await Promise.all([
    listScSalesAction({ page, limit, sort: params.sort, sortDir: params.dir, status, q }),
    getScSalesKpisAction(q),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service center sales"
        sticky={false}
        tutorial={SC_SALES_PAGE_TUTORIAL}
        description="Encode service center sales with package detail sets and reserved (RSV) flow. Units come from the service center's location stock."
        actions={
          capabilities.canCreateSale ? (
            <Button asChild>
              <Link href={`${SC_SALES_HREF}/new`}>
                <Plus className="size-4" />
                New transaction
              </Link>
            </Button>
          ) : null
        }
      />
      <ModuleGuide {...SC_OPS_MODULE_GUIDE} />
      <SalesKpisStrip
        kpis={kpis}
        status={status}
        q={q}
        limit={limit}
        sort={params.sort}
        sortDir={sortDir}
        basePath={SC_SALES_HREF}
      />
      <ScSalesSourceProvider>
        <SalesTable
          result={result}
          capabilities={capabilities}
          initialSort={params.sort ?? ""}
          initialSortDir={params.dir ?? "desc"}
          searchQuery={q ?? ""}
        />
      </ScSalesSourceProvider>
    </div>
  );
}
