import { listSalesAction } from "@/features/sales/actions/sales.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { SalesTable } from "@/app/(app)/sales/_components/sales-table";

export default async function SalesPage() {
  await requirePermission("sales.create");
  const sales = await listSalesAction();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales & ATR"
        description="Minimal branch sales recording with ATR status (open / reserve / closed)."
      />
      <SalesTable sales={sales} />
    </div>
  );
}
