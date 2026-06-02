import { listSalesAction } from "@/features/sales/actions/sales.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { SalesTable } from "@/app/(app)/sales/_components/sales-table";

interface SalesPageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function SalesPage({ searchParams }: SalesPageProps) {
  await requirePermission("sales.create");
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const result = await listSalesAction({ page });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales & ATR"
        description="Branch sales with SN picker, reserved (RSV) flow, and ATR return workflow."
      />
      <SalesTable result={result} />
    </div>
  );
}
