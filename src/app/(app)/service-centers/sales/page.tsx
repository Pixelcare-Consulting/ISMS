import { redirect } from "next/navigation";

import { listScSalesAction } from "@/features/service-center-ops/actions/sc-sales.actions";
import {
  canAccessScSales,
  resolveScSalesCapabilities,
} from "@/features/service-center-ops/constants/sc-permissions";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { ModuleGuide } from "@/components/module-guide";
import { SC_OPS_MODULE_GUIDE } from "@/content/module-guides/service-center-ops";
import { SC_SALES_PAGE_TUTORIAL } from "@/content/page-tutorials/service-center-ops";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { ScSalesPanel } from "@/app/(app)/service-centers/sales/_components/sc-sales-panel";
import { requireAuth } from "@/lib/auth/permissions";
import { pageMetadata } from "@/lib/shared/seo";

export const metadata = pageMetadata(
  "Service center sales",
  "Encode sales and run ATR returns at service centers.",
);

interface PageProps {
  searchParams: Promise<{ page?: string; limit?: string }>;
}

export default async function ScSalesPage({ searchParams }: PageProps) {
  const session = await requireAuth();
  if (!canAccessScSales(session.user.permissions)) {
    redirect("/dashboard?error=forbidden");
  }

  const params = await searchParams;
  const result = await listScSalesAction({
    page: Number(params.page) || 1,
    limit: parseTablePageSize(params.limit),
  });
  const capabilities = resolveScSalesCapabilities(session.user.permissions);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service center sales"
        sticky={false}
        tutorial={SC_SALES_PAGE_TUTORIAL}
        description="Sell STK units from a service center location and process ATR returns."
      />
      <ModuleGuide {...SC_OPS_MODULE_GUIDE} />
      <ScSalesPanel items={result.items} capabilities={capabilities} />
    </div>
  );
}
