import { listSalesAction } from "@/features/sales/actions/sales.actions";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { requirePermission } from "@/lib/auth/permissions";
import { SALES_PAGE_TUTORIAL } from "@/content/page-tutorials/sales";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { SalesTable } from "@/app/(app)/sales/_components/sales-table";

interface SalesPageProps {
  searchParams: Promise<{ page?: string; limit?: string }>;
}

export default async function SalesPage({ searchParams }: SalesPageProps) {
  await requirePermission("sales.create");
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const limit = parseTablePageSize(params.limit);
  const result = await listSalesAction({ page, limit });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales & ATR"
        sticky={false}
        tutorial={SALES_PAGE_TUTORIAL}
        description="Branch sales with SN picker, reserved (RSV) flow, and ATR return workflow."
      />
      <SalesTable result={result} />
    </div>
  );
}
